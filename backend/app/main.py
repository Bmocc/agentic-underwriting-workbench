from __future__ import annotations

import asyncio
import json
import re
import time
from datetime import datetime
from typing import Any, Dict, List, Optional
import requests
from uuid import uuid4
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .config import get_settings
from .database import (
    get_agent_result,
    get_final_analysis,
    get_property_conversation,
    get_search_payload,
    list_property_overrides,
    list_search_history,
    record_agent_result,
    record_final_analysis,
    record_search_pipeline_results,
    record_search_result,
    save_property_conversation,
    save_property_override,
)
from .models import (
    AgentConversationRequest,
    AgentConversationResponse,
    AgentToggleRequest,
    FinalAnalysisRequest,
    PipelineRunRequest,
    PropertyOverrideRequest,
    PropertyOverrideResponse,
    PropertySearchRequest,
    PropertySearchResponse,
    PipelineRunResponse,
    SearchHistoryListResponse,
    UnderwriteRequest,
)
from .rapidapi import property_search
from .underwriting import (
    analyze_multifamily,
    finalize_listing,
    fetch_property_detail,
    run_agent_toggle,
    run_underwriting_pipeline,
)

settings = get_settings()

app = FastAPI(title="Underwriting API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"] ,
    allow_headers=["*"],
)


def _ensure_rapid_key() -> None:
    if not settings.rapidapi_key:
        raise HTTPException(status_code=500, detail="RapidAPI key is not configured. Set RapidAPI_Key in your environment.")


def _timestamp_ms() -> int:
    return int(time.time() * 1000)


def _chat_message(role: str, content: str, *, sources: Optional[List[Dict[str, Any]]] = None) -> dict:
    return {
        "id": uuid4().hex,
        "role": role,
        "content": content,
        "timestamp": _timestamp_ms(),
        "sources": sources or None,
    }


_WORD_CHUNK_RE = re.compile(r"\S+\s*")


def _iter_word_chunks(text: str):
    if not text:
        return
    for match in _WORD_CHUNK_RE.finditer(text):
        yield match.group(0)


def _sse_payload(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _normalize_sources(raw: Any) -> Optional[List[Dict[str, str]]]:
    if not raw:
        return None
    normalized: List[Dict[str, str]] = []
    if isinstance(raw, dict):
        raw_iterable = [raw]
    else:
        raw_iterable = raw
    for item in raw_iterable:
        if not isinstance(item, dict):
            continue
        url = item.get("url")
        if not isinstance(url, str):
            continue
        title = item.get("title")
        normalized.append(
            {
                "title": title if isinstance(title, str) and title.strip() else url,
                "url": url,
            }
        )
    return normalized or None


@app.get("/api/health")
async def health_check() -> dict:
    return {"status": "ok"}


@app.get("/api/property-overrides", response_model=PropertyOverrideResponse)
async def get_property_overrides(search_id: Optional[int] = Query(None)) -> PropertyOverrideResponse:
    overrides = list_property_overrides(search_id)
    return PropertyOverrideResponse(overrides=overrides)


@app.post("/api/property-overrides", response_model=PropertyOverrideResponse)
async def upsert_property_override(req: PropertyOverrideRequest) -> PropertyOverrideResponse:
    overrides_payload: Optional[Dict[str, Any]] = (
        req.overrides.model_dump(exclude_unset=True, exclude_none=True) if req.overrides else None
    )
    save_property_override(req.zpid, overrides_payload, req.search_id)
    overrides = list_property_overrides(req.search_id)
    return PropertyOverrideResponse(overrides=overrides)


@app.post("/api/search", response_model=PropertySearchResponse)
async def search_properties(req: PropertySearchRequest) -> PropertySearchResponse:
    _ensure_rapid_key()
    try:
        payload = property_search(req)
    except requests.HTTPError as exc:  # pragma: no cover - network
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)
    props = payload.get("props") or payload.get("results") or []
    limit = req.limit
    if limit is not None:
        try:
            limit_int = int(limit)
            if limit_int > 0:
                props = props[:limit_int]
        except (TypeError, ValueError):
            pass
    total = payload.get("totalResultCount") or payload.get("total")
    try:
        search_id = record_search_result(req.model_dump(), props, payload, len(props))
    except Exception:  # pragma: no cover - writes shouldn't fail often
        search_id = None
    property_overrides = list_property_overrides(search_id)
    return PropertySearchResponse(
        props=props,
        total_result_count=total,
        raw=payload,
        search_id=search_id,
        property_overrides=property_overrides or None,
    )


@app.get("/api/search/history", response_model=SearchHistoryListResponse)
async def search_history(limit: int = 50) -> SearchHistoryListResponse:
    entries = list_search_history(limit=limit)
    return SearchHistoryListResponse(history=entries)


@app.get("/api/search/history/{search_id}", response_model=PropertySearchResponse)
async def search_history_entry(search_id: int) -> PropertySearchResponse:
    record = get_search_payload(search_id)
    if not record:
        raise HTTPException(status_code=404, detail="Search not found")
    return PropertySearchResponse(
        props=record["props"],
        total_result_count=record.get("total_results"),
        raw=record.get("raw", {}),
        search_id=record["search_id"],
        pipeline_results=record.get("pipeline_results"),
        pipeline_options=record.get("pipeline_options"),
        pipeline_label=record.get("pipeline_label"),
        pipeline_run_at=record.get("pipeline_run_at"),
        property_overrides=record.get("property_overrides") or None,
    )


@app.post("/api/underwrite/direct")
async def direct_underwrite(req: UnderwriteRequest):
    metrics = analyze_multifamily(
        purchase_price=req.purchase_price,
        closing_costs=req.closing_costs,
        initial_repairs=req.initial_repairs,
        down_payment_pct=req.down_payment_pct,
        interest_rate_annual=req.interest_rate_annual,
        loan_term_years=req.loan_term_years,
        vacancy_rate_pct=req.vacancy_rate_pct,
        mgmt_fee_pct_of_egi=req.mgmt_fee_pct_of_egi,
        taxes_annual=req.taxes_annual,
        insurance_annual=req.insurance_annual,
        other_income_monthly=req.other_income_monthly,
        monthly_expenses=req.monthly_expenses,
        unit_mix=req.unit_mix,
    )
    return metrics


@app.post("/api/pipeline/run", response_model=PipelineRunResponse)
async def pipeline_run(req: PipelineRunRequest) -> PipelineRunResponse:
    _ensure_rapid_key()
    try:
        results = await run_underwriting_pipeline(req.listings, req.options, req.listing_overrides)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Pipeline failed: {exc}")
    run_id = None
    if not req.skip_history and req.search_id:
        record_search_pipeline_results(
            search_id=req.search_id,
            results_payload=results,
            options_payload=req.options.model_dump(),
            label=req.label,
        )
        run_id = req.search_id
    return PipelineRunResponse(results=results, run_id=run_id)


@app.get("/api/properties/{zpid}")
async def property_detail(zpid: str) -> dict:
    _ensure_rapid_key()
    try:
        return fetch_property_detail(zpid)
    except requests.HTTPError as exc:  # pragma: no cover
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)


@app.post("/api/agent/run")
async def agent_run(req: AgentToggleRequest) -> dict:
    cached = None
    if not req.force and not req.question:
        cached = get_agent_result(req.listing_payload)
    if cached and not req.force:
        return cached["result"]
    try:
        result = await run_agent_toggle(req)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not req.question:
        record_agent_result(req.zpid, req.listing_payload, result)
    return result


@app.get("/api/agent/conversations/{zpid}", response_model=AgentConversationResponse)
async def agent_conversation(zpid: str) -> AgentConversationResponse:
    record = get_property_conversation(zpid)
    if not record:
        return AgentConversationResponse(zpid=zpid, messages=[])
    return AgentConversationResponse(
        zpid=zpid,
        messages=record["messages"],
        property_snapshot=record.get("property_payload"),
        pipeline_inputs=record.get("pipeline_inputs"),
        search_id=record.get("search_id"),
        updated_at=record.get("updated_at"),
    )


async def _process_agent_conversation(zpid: str, req: AgentConversationRequest) -> tuple[AgentConversationResponse, str]:
    question = (req.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required.")
    listing_payload = req.listing_payload or {}
    conversation = get_property_conversation(zpid)
    existing_messages = conversation["messages"] if conversation else []
    history_for_agent = [
        {"role": msg["role"], "content": msg["content"]}
        for msg in existing_messages
        if msg.get("role") != "system"
    ]
    pipeline_inputs = listing_payload.get("analyze_multifamily")
    if pipeline_inputs is None and conversation:
        pipeline_inputs = conversation.get("pipeline_inputs")
    if pipeline_inputs is None:
        raise HTTPException(status_code=400, detail="Pipeline inputs are required to run the agent.")
    agent_result = await run_agent_toggle(
        AgentToggleRequest(
            listing_payload=listing_payload,
            zpid=zpid,
            use_agent=True,
            force=True,
            question=question,
            chat_history=history_for_agent,
            search_id=req.search_id,
        )
    )
    response_text = agent_result.get("response") or "I was unable to generate a response."
    response_sources = _normalize_sources(agent_result.get("sources"))
    summary_text = agent_result.get("summary")
    next_messages = [dict(msg) for msg in existing_messages]
    if summary_text:
        if next_messages and next_messages[0].get("role") == "system":
            next_messages[0]["content"] = summary_text
            next_messages[0]["timestamp"] = _timestamp_ms()
        else:
            next_messages.insert(0, _chat_message("system", summary_text))
    elif not next_messages:
        address = listing_payload.get("property_snapshot", {}).get("address", "this property")
        next_messages.append(_chat_message("system", f"Discussing property {address}"))
    next_messages.append(_chat_message("user", question))
    next_messages.append(_chat_message("agent", response_text, sources=response_sources))
    property_snapshot = listing_payload.get("property_snapshot")
    if property_snapshot is None and conversation:
        property_snapshot = conversation.get("property_payload")
    search_reference = req.search_id or (conversation.get("search_id") if conversation else None)
    updated_at = datetime.utcnow().isoformat()
    save_property_conversation(
        zpid=zpid,
        messages=next_messages,
        property_payload=property_snapshot,
        pipeline_inputs=pipeline_inputs,
        search_id=search_reference,
    )
    return (
        AgentConversationResponse(
            zpid=zpid,
            messages=next_messages,
            property_snapshot=property_snapshot,
            pipeline_inputs=pipeline_inputs,
            search_id=search_reference,
            updated_at=updated_at,
        ),
        response_text,
    )


@app.post("/api/agent/conversations/{zpid}", response_model=AgentConversationResponse)
async def append_agent_conversation(
    zpid: str,
    req: AgentConversationRequest,
    stream: bool = Query(False),
):
    if stream:
        conversation_response, agent_text = await _process_agent_conversation(zpid, req)

        async def event_stream():
            for chunk in _iter_word_chunks(agent_text):
                yield _sse_payload({"type": "token", "delta": chunk})
                await asyncio.sleep(0)
            yield _sse_payload({"type": "complete", "conversation": conversation_response.model_dump()})

        headers = {
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
        return StreamingResponse(event_stream(), media_type="text/event-stream", headers=headers)

    conversation_response, _ = await _process_agent_conversation(zpid, req)
    return conversation_response


@app.post("/api/analyze/final")
async def final_analysis(req: FinalAnalysisRequest) -> dict:
    _ensure_rapid_key()
    signature_payload = {
        "listing": req.listing,
        "use_agent": req.use_agent,
        "assumption_overrides": req.assumption_overrides.model_dump(exclude_unset=True) if req.assumption_overrides else None,
        "listing_override": req.listing_override.model_dump(exclude_unset=True) if req.listing_override else None,
    }
    if not req.force:
        cached = get_final_analysis(signature_payload)
        if cached:
            return {
                "zpid": cached["zpid"],
                "detail": cached["detail"],
                "final_inputs": cached["final_inputs"],
                "metrics": cached["metrics"],
                "agent_output": cached["agent_output"],
            }
    try:
        result = await finalize_listing(
            req.listing,
            req.use_agent,
            req.assumption_overrides,
            req.listing_override,
        )
    except requests.HTTPError as exc:  # pragma: no cover
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    record_final_analysis(
        zpid=req.zpid,
        payload=signature_payload,
        listing_payload=req.listing,
        final_inputs=result["final_inputs"],
        metrics=result["metrics"],
        detail=result["detail"],
        agent_output=result.get("agent_output"),
    )
    return result
