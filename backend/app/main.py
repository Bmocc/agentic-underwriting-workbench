from __future__ import annotations

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import (
    get_agent_result,
    get_final_analysis,
    get_pipeline_run,
    get_search_payload,
    list_pipeline_runs,
    list_search_history,
    record_agent_result,
    record_final_analysis,
    record_pipeline_run,
    record_search_result,
)
from .models import (
    AgentToggleRequest,
    FinalAnalysisRequest,
    PipelineRunRequest,
    PropertySearchRequest,
    PropertySearchResponse,
    PipelineRunHistoryResponse,
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


@app.get("/api/health")
async def health_check() -> dict:
    return {"status": "ok"}


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
    return PropertySearchResponse(props=props, total_result_count=total, raw=payload, search_id=search_id)


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
    listing_overrides_payload = None
    if req.listing_overrides:
        listing_overrides_payload = {
            key: value.model_dump(exclude_unset=True)
            for key, value in req.listing_overrides.items()
        }
    run_id = None
    if not req.skip_history:
        run_id = record_pipeline_run(
            search_id=req.search_id,
            label=req.label,
            request_payload={"listings": req.listings, "listing_overrides": listing_overrides_payload},
            options_payload=req.options.model_dump(),
            results_payload=results,
        )
    return PipelineRunResponse(results=results, run_id=run_id)


@app.get("/api/pipeline/history", response_model=PipelineRunHistoryResponse)
async def pipeline_history(limit: int = 50) -> PipelineRunHistoryResponse:
    return PipelineRunHistoryResponse(history=list_pipeline_runs(limit=limit))


@app.get("/api/pipeline/history/{run_id}", response_model=PipelineRunResponse)
async def pipeline_history_entry(run_id: int) -> PipelineRunResponse:
    record = get_pipeline_run(run_id)
    if not record:
        raise HTTPException(status_code=404, detail="Pipeline run not found")
    return PipelineRunResponse(results=record["results"], run_id=record["id"])


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
    if not req.force:
        cached = get_agent_result(req.listing_payload)
    if cached and not req.force:
        return cached["result"]
    try:
        result = await run_agent_toggle(req)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    record_agent_result(req.zpid, req.listing_payload, result)
    return result


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
