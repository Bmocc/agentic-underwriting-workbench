from __future__ import annotations

import asyncio
import copy
import json
import os
import re
import time
from functools import lru_cache
from typing import Any, Dict, List, Tuple, Iterable, Optional

import requests

from .config import get_settings
from .models import (
    AgentToggleRequest,
    AssumptionOverrides,
    MonthlyExpenses,
    PipelineOptions,
    UnderwriteMetrics,
    UnderwriteOutput,
    UnitItem,
)

try:
    from agents import Agent, Runner, WebSearchTool, CodeInterpreterTool, function_tool  # type: ignore
    from agents.tracing import set_tracing_disabled  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    Agent = None  # type: ignore
    Runner = None  # type: ignore
    function_tool = lambda x: x  # type: ignore
    WebSearchTool = None  # type: ignore
    CodeInterpreterTool = None  # type: ignore
else:  # pragma: no cover - optional
    if os.environ.get("UNDERWRITER_AGENT_TRACING", "").lower() not in {"1", "true", "yes"}:
        try:
            set_tracing_disabled(True)
        except Exception:
            pass


settings = get_settings()

ASSUMPTIONS = {
    "vacancy_rate_pct": 0.05,
    "mgmt_fee_pct_of_egi": 0.08,
    "interest_rate_annual": 0.07,
    "loan_term_years": 30,
    "down_payment_pct": 0.25,
    "insurance_rate_of_value": 0.004,
    "closing_costs_pct": 0.02,
    "monthly_rent_override": None,
    "tax_rate_pct": None,
    "taxes_annual_fixed": None,
    "initial_repairs": 0.0,
    "renovation_cost_estimate": 0.0,
    "base_monthlies": {
        "repairs_maintenance": 150.0,
        "capex_reserve": 150.0,
        "electric_common": 50.0,
        "water_sewer": 0.0,
        "trash": 0.0,
    },
}

UNDERWRITING_THRESHOLDS = {"min_dscr": 1.20, "min_coc": 0.08}
THRESHOLDS = {
    "cap_keep": 0.055,
    "dscr_keep": 1.15,
    "coc_keep": 0.07,
    "dscr_borderline_lo": 1.05,
    "dscr_borderline_hi": 1.20,
}

STATE_TAX_GUESS = {
    "CT": 0.021,
}


def _apply_override_data(target: Dict[str, Any], data: Dict[str, Any]) -> Dict[str, Any]:
    for key in [
        "vacancy_rate_pct",
        "mgmt_fee_pct_of_egi",
        "interest_rate_annual",
        "loan_term_years",
        "down_payment_pct",
        "insurance_rate_of_value",
        "closing_costs_pct",
        "monthly_rent_override",
        "tax_rate_pct",
        "taxes_annual_fixed",
        "initial_repairs",
        "renovation_cost_estimate",
    ]:
        value = data.get(key)
        if value is not None:
            target[key] = value
    base_monthlies = data.get("base_monthlies")
    if base_monthlies:
        target.setdefault("base_monthlies", copy.deepcopy(ASSUMPTIONS["base_monthlies"]))
        target["base_monthlies"].update(base_monthlies)
    return target


def resolve_assumptions(overrides: AssumptionOverrides | None) -> Dict[str, Any]:
    resolved = copy.deepcopy(ASSUMPTIONS)
    if not overrides:
        return resolved
    data = overrides.model_dump(exclude_unset=True)
    return _apply_override_data(resolved, data)


def merge_assumption_overrides(
    base: Dict[str, Any],
    overrides: AssumptionOverrides | None,
) -> Dict[str, Any]:
    if not overrides:
        return base
    merged = copy.deepcopy(base)
    data = overrides.model_dump(exclude_unset=True)
    return _apply_override_data(merged, data)


def serialize_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    def convert(value: Any) -> Any:
        if isinstance(value, MonthlyExpenses):
            return value.model_dump()
        if isinstance(value, UnitItem):
            return value.model_dump()
        if isinstance(value, list):
            return [convert(v) for v in value]
        return value

    return {k: convert(v) for k, v in payload.items()}


def _normalize_monthly_expenses(expenses: Any) -> MonthlyExpenses:
    if isinstance(expenses, MonthlyExpenses):
        return expenses
    if isinstance(expenses, dict):
        return MonthlyExpenses(
            **{k: float(v) for k, v in expenses.items() if v is not None}
        )
    raise ValueError("monthly_expenses must be a mapping")


def _normalize_unit_mix(unit_mix: Iterable[Any] | None) -> List[UnitItem]:
    if not unit_mix:
        return [UnitItem(unit_type="Total", count=1, rent=0.0)]
    normalized: List[UnitItem] = []
    for item in unit_mix:
        if isinstance(item, UnitItem):
            normalized.append(item)
        elif isinstance(item, dict):
            normalized.append(UnitItem(**item))
    return normalized or [UnitItem(unit_type="Total", count=1, rent=0.0)]


def _build_underwrite_output_from_payload(payload: Dict[str, Any]) -> UnderwriteOutput:
    if not payload:
        raise ValueError("listing_payload is required for chat analysis")
    raw_analyze_payload = payload.get("analyze_multifamily") or payload
    if not raw_analyze_payload:
        raise ValueError("listing_payload must include analyze_multifamily inputs")
    analyze_payload: Dict[str, Any] = {}
    for key in ANALYZE_FIELDS:
        if key in raw_analyze_payload and raw_analyze_payload[key] is not None:
            analyze_payload[key] = raw_analyze_payload[key]
    if "purchase_price" not in analyze_payload:
        price = payload.get("property_snapshot", {}).get("price") or raw_analyze_payload.get("price")
        if price is None:
            raise ValueError("purchase_price missing in analyze payload")
        analyze_payload["purchase_price"] = float(price)
    analyze_payload.setdefault("closing_costs", 0.0)
    if "monthly_expenses" in analyze_payload:
        analyze_payload["monthly_expenses"] = _normalize_monthly_expenses(analyze_payload["monthly_expenses"])
    if "unit_mix" in analyze_payload:
        analyze_payload["unit_mix"] = _normalize_unit_mix(analyze_payload["unit_mix"])
    metrics = analyze_multifamily(**analyze_payload)
    passes_filters = (
        metrics.dscr >= UNDERWRITING_THRESHOLDS["min_dscr"]
        and metrics.cash_on_cash >= UNDERWRITING_THRESHOLDS["min_coc"]
    )
    reasons: List[str] = []
    if metrics.dscr < UNDERWRITING_THRESHOLDS["min_dscr"]:
        reasons.append(
            f"DSCR {metrics.dscr:.2f} is below the {UNDERWRITING_THRESHOLDS['min_dscr']:.2f} target."
        )
    if metrics.cash_on_cash < UNDERWRITING_THRESHOLDS["min_coc"]:
        reasons.append(
            f"Cash-on-cash {(metrics.cash_on_cash * 100):.1f}% trails the {(UNDERWRITING_THRESHOLDS['min_coc'] * 100):.1f}% goal."
        )
    snapshot = payload.get("property_snapshot") or {}
    zpid_value = snapshot.get("zpid") or payload.get("zpid")
    try:
        zpid_int = int(zpid_value) if zpid_value is not None else None
    except (TypeError, ValueError):
        zpid_int = None
    return UnderwriteOutput(
        address=snapshot.get("address"),
        zpid=zpid_int,
        passes_filters=passes_filters,
        reasons=reasons or ["Metrics clear the baseline underwriting guardrails."],
        metrics=metrics,
    )


def _rent_guidance_line(metrics: UnderwriteMetrics, snapshot: Dict[str, Any]) -> str | None:
    target_dscr = UNDERWRITING_THRESHOLDS["min_dscr"]
    if metrics.dscr <= 0 or metrics.dscr >= target_dscr:
        return None
    multiplier = target_dscr / max(metrics.dscr, 1e-6)
    target_gsr = metrics.gsr_monthly * multiplier
    uplift = target_gsr - metrics.gsr_monthly
    if uplift <= 25:
        return None
    unit_count = (
        snapshot.get("unitsCount")
        or snapshot.get("unitCount")
        or snapshot.get("numUnits")
        or snapshot.get("units")
    )
    try:
        unit_count_val = int(unit_count)
    except (TypeError, ValueError):
        unit_count_val = None
    per_unit = uplift / unit_count_val if unit_count_val and unit_count_val > 0 else None
    if per_unit:
        return (
            f"To reach a {target_dscr:.2f} DSCR you'd need roughly ${uplift:,.0f}/mo more gross rent "
            f"(about ${per_unit:,.0f} per unit)."
        )
    return f"To reach a {target_dscr:.2f} DSCR you'd need roughly ${uplift:,.0f} more gross rent each month."


def _normalize_unit_mix_payload(unit_count: int, rent: float) -> List[UnitItem]:
    if unit_count <= 0:
        unit_count = 1
    return [UnitItem(unit_type="Unit", count=unit_count, rent=rent)]


def _prepare_payload_for_analysis(base_payload: Dict[str, Any], unit_count: int, rent: float) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    for key in ANALYZE_FIELDS:
        if key in base_payload and base_payload[key] is not None:
            payload[key] = copy.deepcopy(base_payload[key])
    payload["unit_mix"] = _normalize_unit_mix_payload(unit_count, rent)
    expenses = payload.get("monthly_expenses")
    if isinstance(expenses, MonthlyExpenses):
        payload["monthly_expenses"] = expenses
    else:
        payload["monthly_expenses"] = MonthlyExpenses(**(expenses or {}))
    payload.setdefault("closing_costs", float(base_payload.get("closing_costs") or 0.0))
    payload.setdefault("initial_repairs", float(base_payload.get("initial_repairs") or 0.0))
    return payload


def _solve_rent_for_target(
    analyze_payload: Optional[Dict[str, Any]],
    unit_count: int,
    target_dscr: float,
) -> Optional[Tuple[float, UnderwriteMetrics]]:
    if not analyze_payload:
        return None
    high = 6000.0
    low = 0.0
    best: Optional[Tuple[float, UnderwriteMetrics]] = None
    for _ in range(18):
        guess = (low + high) / 2.0
        metrics = analyze_multifamily(**_prepare_payload_for_analysis(analyze_payload, unit_count, guess))
        if metrics.dscr >= target_dscr:
            best = (guess, metrics)
            high = guess
        else:
            low = guess
    return best


def _infer_unit_count(snapshot: Dict[str, Any], analyze_payload: Optional[Dict[str, Any]], question: str) -> int:
    for key in ("unitsCount", "unitCount", "numUnits", "units"):
        value = snapshot.get(key)
        if value is None and analyze_payload:
            value = analyze_payload.get(key)
        if value is not None:
            try:
                parsed = int(value)
                if parsed > 0:
                    return parsed
            except (TypeError, ValueError):
                continue
    if analyze_payload:
        mix = analyze_payload.get("unit_mix") or []
        total = 0
        for item in mix:
            try:
                total += int(item.get("count", 0))
            except (TypeError, ValueError, AttributeError):
                continue
        if total > 0:
            return total
    question_lower = question.lower()
    word_to_num = {
        "one": 1,
        "two": 2,
        "both": 2,
        "three": 3,
        "four": 4,
        "five": 5,
    }
    for word, num in word_to_num.items():
        if word in question_lower:
            return num
    match = re.search(r"(\d+)\s*(unit|plex|door|apartment)", question_lower)
    if match:
        try:
            parsed = int(match.group(1))
            if parsed > 0:
                return parsed
        except ValueError:
            pass
    return 2


def _summarize_property_for_chat(snapshot: Dict[str, Any], metrics: UnderwriteMetrics) -> str:
    address = snapshot.get("address") or "Subject property"
    price = snapshot.get("price") or snapshot.get("unformattedPrice") or snapshot.get("zestimate")
    try:
        price_str = f"${float(price):,.0f}" if price is not None else None
    except (TypeError, ValueError):
        price_str = None
    beds = snapshot.get("bedrooms")
    baths = snapshot.get("bathrooms")
    units = (
        snapshot.get("unitsCount")
        or snapshot.get("unitCount")
        or snapshot.get("numUnits")
        or snapshot.get("units")
    )
    segments = [address]
    if price_str:
        segments.append(f"ask {price_str}")
    detail_bits = []
    if beds is not None:
        detail_bits.append(f"{beds} bd")
    if baths is not None:
        detail_bits.append(f"{baths} ba")
    if units is not None:
        detail_bits.append(f"{units} units")
    if detail_bits:
        segments.append(" / ".join(detail_bits))
    segments.append(
        f"DSCR {metrics.dscr:.2f} | CoC {(metrics.cash_on_cash * 100):.1f}% | Cap {(metrics.cap_rate * 100):.1f}%"
    )
    return " — ".join(segments)


def _compose_chat_response(
    output: UnderwriteOutput,
    question: str,
    snapshot: Dict[str, Any],
    history: List[Dict[str, str]] | None = None,
    analyze_payload: Optional[Dict[str, Any]] = None,
) -> str:
    question_lower = question.lower()
    metrics = output.metrics
    lines = [_summarize_property_for_chat(snapshot or {}, metrics)]
    if output.passes_filters:
        lines.append("It currently clears the baseline DSCR and cash-on-cash guardrails.")
    else:
        lines.append("It misses the baseline guardrails because " + "; ".join(output.reasons or []))
    targeted = False
    if any(word in question_lower for word in ("dscr", "debt", "loan", "coverage")):
        targeted = True
        lines.append(
            f"Debt coverage is {metrics.dscr:.2f}; you'd want {UNDERWRITING_THRESHOLDS['min_dscr']:.2f}+ so consider rent growth or expense cuts."
        )
    if "cash" in question_lower or "return" in question_lower:
        targeted = True
        lines.append(
            f"Annual cash flow is ${metrics.cash_flow_annual:,.0f} ({(metrics.cash_on_cash * 100):.1f}% CoC) which is "
            f"{'above' if output.passes_filters else 'below'} the {UNDERWRITING_THRESHOLDS['min_coc'] * 100:.1f}% target."
        )
    if "cap" in question_lower or "value" in question_lower or "price" in question_lower:
        targeted = True
        lines.append(
            f"At the assumed price the cap rate is {(metrics.cap_rate * 100):.1f}% and GRM {metrics.grm:.2f}; adjust offer or NOI to meet your hurdle."
        )
    if any(word in question_lower for word in ("rent", "lease", "vacancy")):
        targeted = True
        rent_line = _rent_guidance_line(metrics, snapshot)
        if rent_line:
            lines.append(rent_line)
        else:
            unit_count = _infer_unit_count(snapshot or {}, analyze_payload, question)
            solution = _solve_rent_for_target(analyze_payload, unit_count, UNDERWRITING_THRESHOLDS["min_dscr"])
            if solution:
                per_unit_rent, projected_metrics = solution
                total_rent = per_unit_rent * unit_count
                lines.append(
                    f"DSCR {metrics.dscr:.2f} assumes $0 rent; to reach {UNDERWRITING_THRESHOLDS['min_dscr']:.2f} you'd target about "
                    f"${total_rent:,.0f}/mo gross (~${per_unit_rent:,.0f} per unit across {unit_count} units), which would yield "
                    f"DSCR {projected_metrics.dscr:.2f} and CoC {(projected_metrics.cash_on_cash * 100):.1f}%."
                )
            else:
                lines.append(
                    "Current rent inputs are blank—drop in per-unit rent overrides (e.g., both 2/1s at $1,200) so I can re-run the math."
                )
    if any(word in question_lower for word in ("expense", "tax", "opex", "insurance")):
        targeted = True
        lines.append(
            f"Operating expenses run about ${(metrics.operating_expenses_monthly):,.0f}/mo (expense ratio {(metrics.expense_ratio * 100):.1f}%)."
        )
    if any(word in question_lower for word in ("risk", "concern", "downside", "issue")):
        targeted = True
        lines.append("Key risks: " + "; ".join(output.reasons or ["tight DSCR or cash-on-cash thresholds."]))
    if not targeted:
        lines.append("Given that prompt, focus on tweaking rent, expenses, or financing to move DSCR and CoC upward.")
    if history:
        last_question = next((msg["content"] for msg in reversed(history) if msg.get("role") == "user"), None)
        if last_question and last_question.strip().lower() != question_lower:
            lines.append(f"Picking up from your earlier question \"{last_question.strip()}\".")
    lines.append("Ask for scenario tweaks (rent bumps, expense cuts, financing changes) and I'll recompute.")
    return " ".join(lines)


def _pmt(rate_monthly: float, nper: int, pv: float) -> float:
    if rate_monthly == 0:
        return -(pv / nper)
    return -(pv * rate_monthly * (1 + rate_monthly) ** nper) / ((1 + rate_monthly) ** nper - 1)


def analyze_multifamily(
    purchase_price: float,
    closing_costs: float = 0.0,
    initial_repairs: float = 0.0,
    down_payment_pct: float = 0.25,
    interest_rate_annual: float = 0.07,
    loan_term_years: int = 30,
    vacancy_rate_pct: float = 0.05,
    mgmt_fee_pct_of_egi: float = 0.08,
    taxes_annual: float = 0.0,
    insurance_annual: float = 0.0,
    other_income_monthly: float = 0.0,
    monthly_expenses: MonthlyExpenses | None = None,
    unit_mix: List[UnitItem] | None = None,
) -> UnderwriteMetrics:
    if monthly_expenses is None:
        monthly_expenses = MonthlyExpenses()
    if not unit_mix:
        unit_mix = [UnitItem(unit_type="Total", count=1, rent=0.0)]

    gsr_monthly = sum(ui.count * ui.rent for ui in unit_mix)
    vacancy_loss_mo = vacancy_rate_pct * gsr_monthly
    egi_monthly = gsr_monthly - vacancy_loss_mo + other_income_monthly

    op_ex_monthly = (
        (taxes_annual + insurance_annual) / 12.0
        + monthly_expenses.total()
        + mgmt_fee_pct_of_egi * egi_monthly
    )

    noi_annual = (egi_monthly - op_ex_monthly) * 12.0
    loan_amount = purchase_price * (1 - down_payment_pct)
    debt_mo = -_pmt(interest_rate_annual / 12.0, loan_term_years * 12, loan_amount)
    debt_annual = debt_mo * 12.0

    units_total = sum(ui.count for ui in unit_mix) or 0
    cash_invested = purchase_price * down_payment_pct + closing_costs + initial_repairs
    annual_cash_flow = noi_annual - debt_annual
    monthly_cash_flow = annual_cash_flow / 12.0

    cap_rate = (noi_annual / purchase_price) if purchase_price else 0.0
    cash_on_cash = (annual_cash_flow / cash_invested) if cash_invested else 0.0
    dscr = (noi_annual / debt_annual) if debt_annual else 0.0
    breakeven_occupancy = (
        ((taxes_annual + insurance_annual) + monthly_expenses.total() * 12 + debt_annual)
        / (gsr_monthly * 12)
    ) if gsr_monthly else 0.0
    grm = (purchase_price / (gsr_monthly * 12)) if gsr_monthly else 0.0
    price_per_unit = (purchase_price / units_total) if units_total else 0.0
    expense_ratio = (
        (
            (taxes_annual + insurance_annual)
            + monthly_expenses.total() * 12
            + mgmt_fee_pct_of_egi * egi_monthly * 12
        )
        / (egi_monthly * 12)
    ) if egi_monthly else 0.0

    return UnderwriteMetrics(
        gsr_monthly=gsr_monthly,
        egi_monthly=egi_monthly,
        operating_expenses_monthly=op_ex_monthly,
        noi_annual=noi_annual,
        debt_service_annual=debt_annual,
        cash_invested=cash_invested,
        cash_flow_annual=annual_cash_flow,
        cash_flow_monthly=monthly_cash_flow,
        cap_rate=cap_rate,
        cash_on_cash=cash_on_cash,
        dscr=dscr,
        breakeven_occupancy=breakeven_occupancy,
        grm=grm,
        price_per_unit=price_per_unit,
        expense_ratio=expense_ratio,
    )


def _build_toolkit(function_tool_ref):
    tools: List[Any] = []
    if function_tool_ref is not None:
        tools.append(function_tool_ref)
    if WebSearchTool:
        try:
            tools.append(WebSearchTool())
        except Exception:
            pass
    if CodeInterpreterTool:
        try:
            tools.append(CodeInterpreterTool(
                tool_config={"type": "code_interpreter", "container": {"type": "auto"}}))
        except Exception:
            pass
    return tools


if Agent:
    analyze_multifamily_tool = function_tool(analyze_multifamily)
    shared_tools = _build_toolkit(analyze_multifamily_tool)

    underwriter_agent = Agent(
        name="Multifamily Underwriter",
        model=settings.agent_model,
        tools=shared_tools,
        output_type=UnderwriteOutput,
        instructions=f"""
You are an underwriter. When given a listing payload, you MUST call analyze_multifamily with the provided numbers.
Decide passes_filters using:
- pass if DSCR >= {UNDERWRITING_THRESHOLDS['min_dscr']} AND Cash-on-Cash >= {UNDERWRITING_THRESHOLDS['min_coc']}.
Return ONLY the UnderwriteOutput object.
Add concise reasons, e.g. 'DSCR=1.27', 'CoC=9.4%', 'Auction/as-is', 'Owner pays heat'.
- Whenever you reference external data (e.g., comps, market stats), populate `sources` with up to 4 entries, each containing `title` and `url`.
"""
    )
    conversation_agent = Agent(
        name="Deal Research Copilot",
        model=settings.agent_model,
        tools=shared_tools,
        output_type=UnderwriteOutput,
        instructions=f"""
You are a conversational analyst helping investors underwrite multifamily properties.
Blend research, underwriting math, and actionable advice. Always:
- Reference the provided property snapshot and pipeline inputs when answering questions.
- Call analyze_multifamily whenever you need updated metrics or scenario testing; cite DSCR, CoC, NOI, rent, cap, etc.
- Use WebSearchTool when market perspective, comps, regulations, or macro context would improve the answer. Summarize what you learn.
- Use CodeInterpreterTool for quick calculations or to produce code snippets (Python preferred) when asked for models, tables, or scripts.
- If you run code, include the relevant snippet and concise takeaways in the `response`.
- Populate `response` with a conversational explanation (bullets are fine) and write a one-line `summary` for the chat drawer.
- Keep guidance pragmatic: highlight risks, ideas to improve metrics, or next steps the investor can take.
- When you cite web research, fill the `sources` list (max 5) with dictionaries like {{\"title\": \"Site\", \"url\": \"https://...\"}} matching what you referenced.
"""
    )
else:
    analyze_multifamily_tool = None
    underwriter_agent = None
    conversation_agent = None


def _state_from_address(addr: str) -> str:
    if not addr:
        return ""
    parts = [p.strip() for p in addr.split(",")]
    if len(parts) >= 2:
        tokens = parts[-1].split()
        if len(tokens) == 0 and len(parts) >= 3:
            return parts[-2].split()[0]
        if len(tokens) >= 1:
            return tokens[0]
    if len(parts) >= 3:
        return parts[-2].split()[0]
    return ""


def _estimate_taxes_annual(price: float, state: str, override_rate: float | None = None) -> float:
    if override_rate is not None:
        return price * override_rate
    rate = STATE_TAX_GUESS.get(state.upper(), 0.015)
    return price * rate


def _get_price(listing: Dict[str, Any]) -> float:
    return float(listing.get("price") or listing.get("unformattedPrice") or listing.get("zestimate") or 0.0)


def _get_rent_proxy(listing: Dict[str, Any]) -> float:
    r = listing.get("rentZestimate")
    try:
        return float(r) if r is not None else 0.0
    except Exception:
        return 0.0


def _listing_key(listing: Dict[str, Any]) -> str:
    raw = listing.get("zpid") or listing.get("zpidId")
    return str(raw) if raw is not None else ""


def build_coarse_inputs(listing: Dict[str, Any], assumptions: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    price = _get_price(listing)
    state = _state_from_address(listing.get("address", ""))
    taxes_fixed = assumptions.get("taxes_annual_fixed")
    tax_rate_override = assumptions.get("tax_rate_pct")
    taxes_annual = (
        taxes_fixed
        if taxes_fixed is not None
        else (_estimate_taxes_annual(price, state, tax_rate_override) if price else 0.0)
    )
    insurance_rate = assumptions.get("insurance_rate_of_value", ASSUMPTIONS["insurance_rate_of_value"])
    insurance_annual = price * insurance_rate if price else 0.0
    hoa = 0.0
    closing_costs_pct = assumptions.get("closing_costs_pct", ASSUMPTIONS["closing_costs_pct"])
    base_initial_repairs = assumptions.get("initial_repairs", ASSUMPTIONS["initial_repairs"])
    renovation_cost_estimate = assumptions.get("renovation_cost_estimate", ASSUMPTIONS["renovation_cost_estimate"])
    total_initial_repairs = base_initial_repairs + renovation_cost_estimate

    base_monthlies = dict(ASSUMPTIONS["base_monthlies"])
    base_monthlies.update(assumptions.get("base_monthlies") or {})
    expenses = MonthlyExpenses(
        repairs_maintenance=base_monthlies.get("repairs_maintenance", 0.0),
        capex_reserve=base_monthlies.get("capex_reserve", 0.0),
        electric_common=base_monthlies.get("electric_common", 0.0),
        water_sewer=base_monthlies.get("water_sewer", 0.0),
        trash=base_monthlies.get("trash", 0.0),
        hoa_condo_fee=hoa,
    )

    rent_override = assumptions.get("monthly_rent_override")
    monthly_rent = float(rent_override) if rent_override not in (None, "") else _get_rent_proxy(listing)
    unit_mix = [UnitItem(unit_type="Property", count=1, rent=monthly_rent)]

    payload = {
        "purchase_price": price,
        "closing_costs": closing_costs_pct * price,
        "initial_repairs": total_initial_repairs,
        "down_payment_pct": assumptions.get("down_payment_pct", ASSUMPTIONS["down_payment_pct"]),
        "interest_rate_annual": assumptions.get("interest_rate_annual", ASSUMPTIONS["interest_rate_annual"]),
        "loan_term_years": assumptions.get("loan_term_years", ASSUMPTIONS["loan_term_years"]),
        "vacancy_rate_pct": assumptions.get("vacancy_rate_pct", ASSUMPTIONS["vacancy_rate_pct"]),
        "mgmt_fee_pct_of_egi": assumptions.get("mgmt_fee_pct_of_egi", ASSUMPTIONS["mgmt_fee_pct_of_egi"]),
        "taxes_annual": taxes_annual,
        "insurance_annual": insurance_annual,
        "other_income_monthly": 0.0,
        "monthly_expenses": expenses,
        "unit_mix": unit_mix,
    }
    meta = {
        "closing_costs_pct_used": closing_costs_pct,
        "initial_repairs_breakdown": {
            "base_initial_repairs": base_initial_repairs,
            "renovation_cost_estimate": renovation_cost_estimate,
            "total_initial_repairs": total_initial_repairs,
        },
    }
    return payload, meta


def coarse_screen_one(listing: Dict[str, Any], assumptions: Dict[str, Any]) -> Tuple[bool, Dict[str, Any]]:
    payload, meta = build_coarse_inputs(listing, assumptions)
    metrics = analyze_multifamily(**payload)
    cap = metrics.cap_rate
    dscr = metrics.dscr
    coc = metrics.cash_on_cash
    eligible = (
        (cap >= THRESHOLDS["cap_keep"]) or (dscr >= THRESHOLDS["dscr_keep"]) or (coc >= THRESHOLDS["coc_keep"])
        or (THRESHOLDS["dscr_borderline_lo"] <= dscr <= THRESHOLDS["dscr_borderline_hi"])
    )
    serialized = serialize_payload(payload)
    serialized.update(meta)
    return eligible, {"payload": payload, "payload_serialized": serialized, "meta": meta, "metrics": metrics.model_dump()}


def should_fetch_details(metrics: Dict[str, float]) -> bool:
    dscr = metrics.get("dscr", 0.0) or 0.0
    cap = metrics.get("cap_rate", 0.0) or 0.0
    coc = metrics.get("cash_on_cash", 0.0) or 0.0
    return (cap >= THRESHOLDS["cap_keep"]) or (dscr >= THRESHOLDS["dscr_borderline_lo"]) or (coc >= THRESHOLDS["coc_keep"])


@lru_cache(maxsize=4096)
def fetch_detail(zpid: str) -> Dict[str, Any]:
    url = f"https://{settings.rapidapi_host}/property"
    resp = requests.get(
        url,
        headers={"x-rapidapi-key": settings.rapidapi_key or "", "x-rapidapi-host": settings.rapidapi_host},
        params={"zpid": zpid},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def build_final_inputs(listing: Dict[str, Any], detail: Dict[str, Any], coarse_payload: Dict[str, Any]) -> Dict[str, Any]:
    p = dict(coarse_payload)

    tax = (
        detail.get("resoFacts", {}).get("taxAnnualAmount")
        or detail.get("taxAnnualAmount")
        or detail.get("taxHistory", [{}])[-1].get("taxPaid", 0)
        if detail.get("taxHistory")
        else 0
    )
    if tax:
        p["taxes_annual"] = float(tax)

    hoa = detail.get("monthlyHoaFee")
    if hoa is not None:
        me: MonthlyExpenses = p["monthly_expenses"]
        p["monthly_expenses"] = MonthlyExpenses(**{**me.model_dump(), "hoa_condo_fee": float(hoa)})

    units_total = (
        detail.get("resoFacts", {}).get("numberOfUnitsInCommunity")
        or detail.get("resoFacts", {}).get("unitsTotal")
        or detail.get("unitsTotal")
    )
    try:
        units_total = int(units_total) if units_total else None
    except Exception:
        units_total = None

    if units_total and units_total > 0:
        gsr = sum(ui.count * ui.rent for ui in p["unit_mix"])
        per_unit = (gsr / units_total) if gsr else 0.0
        p["unit_mix"] = [UnitItem(unit_type="Unit", count=units_total, rent=per_unit)]

    return p


async def run_underwriting_pipeline(
    listings: List[Dict[str, Any]],
    options: PipelineOptions,
    listing_overrides: Dict[str, AssumptionOverrides] | None = None,
) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    shortlist_indices: List[int] = []
    base_assumptions = resolve_assumptions(options.assumption_overrides)
    overrides_map: Dict[str, AssumptionOverrides] = listing_overrides or {}
    coarse_payloads: Dict[int, Tuple[Dict[str, Any], Dict[str, Any]]] = {}

    for idx, lst in enumerate(listings):
        zpid = _listing_key(lst)
        address = lst.get("address", "")
        price = _get_price(lst)
        listing_override = overrides_map.get(zpid)
        assumptions_for_listing = (
            merge_assumption_overrides(base_assumptions, listing_override) if listing_override else base_assumptions
        )
        ok, coarse = coarse_screen_one(lst, assumptions_for_listing)
        coarse_payloads[idx] = (coarse["payload"], coarse["meta"])
        results.append(
            {
                "idx": idx,
                "zpid": zpid,
                "address": address,
                "price": price,
                "stage": "coarse",
                "coarse_metrics": coarse["metrics"],
                "coarse_inputs": coarse["payload_serialized"],
                "final_metrics": None,
                "final_inputs": None,
                "detail_fetched": False,
            }
        )
        if ok and should_fetch_details(coarse["metrics"]):
            shortlist_indices.append(idx)

    if options.fetch_details_for_promising and shortlist_indices:
        fetched = 0
        for idx in shortlist_indices:
            if fetched >= options.max_detail_fetches:
                break
            row = results[idx]
            zpid = row["zpid"]
            if not zpid:
                continue

            try:
                detail = fetch_detail(zpid)
                fetched += 1
                time.sleep(options.detail_sleep_sec)
            except Exception as e:  # pragma: no cover - network errors
                row["detail_error"] = str(e)
                continue

            coarse_payload_tuple = coarse_payloads.get(idx)
            if coarse_payload_tuple is None:
                listing_override = overrides_map.get(zpid)
                assumptions_for_listing = (
                    merge_assumption_overrides(base_assumptions, listing_override)
                    if listing_override
                    else base_assumptions
                )
                coarse_payload_tuple = build_coarse_inputs(listings[idx], assumptions_for_listing)
            coarse_payload, coarse_meta = coarse_payload_tuple
            coarse_meta = coarse_meta or {}
            final_inputs = build_final_inputs(listings[idx], detail, coarse_payload)
            final_inputs_serialized = serialize_payload(final_inputs)
            final_inputs_serialized.update(coarse_meta)

            if not options.use_agent_for_final:
                final_metrics = analyze_multifamily(**final_inputs).model_dump()
            else:
                if not underwriter_agent or not Runner:
                    raise RuntimeError("Agent SDK is not available in this environment")
                tool_args = {"analyze_multifamily": final_inputs_serialized}
                msg = "Underwrite this listing and return UnderwriteOutput only:\n" + json.dumps(tool_args)
                agent_result = await Runner.run(underwriter_agent, input=msg)
                final_metrics = agent_result.final_output.metrics.model_dump()
                row["agent_passes_filters"] = agent_result.final_output.passes_filters
                row["agent_reasons"] = agent_result.final_output.reasons

            row.update({
                "stage": "final",
                "final_metrics": final_metrics,
                "final_inputs": final_inputs_serialized,
                "detail_fetched": True,
            })

    def sort_key(r: Dict[str, Any]):
        m = r["final_metrics"] or r["coarse_metrics"]
        return (m.get("dscr", 0.0), m.get("cash_on_cash", 0.0))

    results.sort(key=sort_key, reverse=True)
    return results


async def run_agent_toggle(req: AgentToggleRequest) -> Dict[str, Any]:
    if req.question:
        listing_payload = req.listing_payload or {}
        snapshot = listing_payload.get("property_snapshot") or {}
        analyze_payload = listing_payload.get("analyze_multifamily")
        base_output = _build_underwrite_output_from_payload(listing_payload)
        fallback_response = _compose_chat_response(
            base_output,
            req.question,
            snapshot or {},
            req.chat_history,
            analyze_payload,
        )
        fallback_result = base_output.model_dump()
        fallback_result["response"] = fallback_response
        fallback_result["summary"] = _summarize_property_for_chat(snapshot or {}, base_output.metrics)
        fallback_result.setdefault("sources", [])
        if conversation_agent and Runner:
            try:
                tool_args = {"analyze_multifamily": analyze_payload} if analyze_payload else {}
                context = {
                    "property_snapshot": snapshot,
                    "chat_history": req.chat_history or [],
                    "question": req.question,
                    "pipeline_inputs": analyze_payload,
                }
                prompt = (
                    "You are the Deal Research Copilot. Blend research, underwriting math, and coding help as needed.\n"
                    "Context JSON follows; call tools when helpful:\n"
                    f"{json.dumps(context, default=str)}\n"
                    "If you modify underwriting assumptions, explain the change. When citing metrics, include the numbers.\n"
                    f"Available tool payloads: {json.dumps(tool_args, default=str)}"
                )
                agent_result = await Runner.run(conversation_agent, input=prompt)
                final_output = agent_result.final_output.model_dump()
                if not final_output.get("response"):
                    final_output["response"] = fallback_response
                final_output.setdefault("summary", fallback_result["summary"])
                final_output.setdefault("sources", [])
                return final_output
            except Exception:
                pass
        return fallback_result
    if not underwriter_agent or not Runner:
        raise RuntimeError("Agent SDK is not available in this environment")
    msg = "Underwrite this listing and return UnderwriteOutput only:\n" + json.dumps(req.listing_payload)
    agent_result = await Runner.run(underwriter_agent, input=msg)
    final_output = agent_result.final_output.model_dump()
    final_output.setdefault("sources", [])
    return final_output


def fetch_property_detail(zpid: str) -> Dict[str, Any]:
    url = f"https://{settings.rapidapi_host}/property"
    resp = requests.get(
        url,
        headers={"x-rapidapi-key": settings.rapidapi_key or "", "x-rapidapi-host": settings.rapidapi_host},
        params={"zpid": zpid},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


async def finalize_listing(
    listing: Dict[str, Any],
    use_agent: bool = False,
    assumption_overrides: AssumptionOverrides | None = None,
    listing_override: AssumptionOverrides | None = None,
) -> Dict[str, Any]:
    zpid = str(listing.get("zpid") or listing.get("zpidId") or "")
    if not zpid:
        raise ValueError("Listing must include a zpid to finalize")

    detail = fetch_property_detail(zpid)
    assumptions = resolve_assumptions(assumption_overrides)
    final_assumptions = merge_assumption_overrides(assumptions, listing_override) if listing_override else assumptions
    coarse_payload, coarse_meta = build_coarse_inputs(listing, final_assumptions)
    coarse_meta = coarse_meta or {}
    final_inputs = build_final_inputs(listing, detail, coarse_payload)
    final_inputs_serialized = serialize_payload(final_inputs)
    final_inputs_serialized.update(coarse_meta)
    metrics = analyze_multifamily(**final_inputs).model_dump()

    response: Dict[str, Any] = {
        "zpid": zpid,
        "detail": detail,
        "final_inputs": final_inputs_serialized,
        "metrics": metrics,
    }

    if use_agent:
        if not underwriter_agent or not Runner:
            raise RuntimeError("Agent SDK is not available in this environment")
        tool_args = {"analyze_multifamily": final_inputs_serialized}
        msg = "Underwrite this listing and return UnderwriteOutput only:\n" + json.dumps(tool_args)
        agent_result = await Runner.run(underwriter_agent, input=msg)
        response["agent_output"] = agent_result.final_output.model_dump()

    return response
ANALYZE_FIELDS = {
    "purchase_price",
    "closing_costs",
    "initial_repairs",
    "down_payment_pct",
    "interest_rate_annual",
    "loan_term_years",
    "vacancy_rate_pct",
    "mgmt_fee_pct_of_egi",
    "taxes_annual",
    "insurance_annual",
    "other_income_monthly",
    "monthly_expenses",
    "unit_mix",
}
