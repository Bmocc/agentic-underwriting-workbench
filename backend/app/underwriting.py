from __future__ import annotations

import asyncio
import copy
import json
import time
from functools import lru_cache
from typing import Any, Dict, List, Tuple

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
    from agents import Agent, Runner, function_tool  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    Agent = None  # type: ignore
    Runner = None  # type: ignore
    function_tool = lambda x: x  # type: ignore


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


if Agent:
    analyze_multifamily_tool = function_tool(analyze_multifamily)
    underwriter_agent = Agent(
        name="Multifamily Underwriter",
        model=settings.agent_model,
        tools=[analyze_multifamily_tool],
        output_type=UnderwriteOutput,
        instructions=f"""
You are an underwriter. When given a listing payload, you MUST call analyze_multifamily with the provided numbers.
Decide passes_filters using:
- pass if DSCR >= {UNDERWRITING_THRESHOLDS['min_dscr']} AND Cash-on-Cash >= {UNDERWRITING_THRESHOLDS['min_coc']}.
Return ONLY the UnderwriteOutput object.
Add concise reasons, e.g. 'DSCR=1.27', 'CoC=9.4%', 'Auction/as-is', 'Owner pays heat'.
"""
    )
else:
    analyze_multifamily_tool = None
    underwriter_agent = None


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


def build_coarse_inputs(listing: Dict[str, Any], assumptions: Dict[str, Any]) -> Dict[str, Any]:
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

    return {
        "purchase_price": price,
        "closing_costs": assumptions.get("closing_costs_pct", ASSUMPTIONS["closing_costs_pct"]) * price,
        "initial_repairs": 0.0,
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


def coarse_screen_one(listing: Dict[str, Any], assumptions: Dict[str, Any]) -> Tuple[bool, Dict[str, Any]]:
    payload = build_coarse_inputs(listing, assumptions)
    metrics = analyze_multifamily(**payload)
    cap = metrics.cap_rate
    dscr = metrics.dscr
    coc = metrics.cash_on_cash
    eligible = (
        (cap >= THRESHOLDS["cap_keep"]) or (dscr >= THRESHOLDS["dscr_keep"]) or (coc >= THRESHOLDS["coc_keep"])
        or (THRESHOLDS["dscr_borderline_lo"] <= dscr <= THRESHOLDS["dscr_borderline_hi"])
    )
    return eligible, {"payload": payload, "payload_serialized": serialize_payload(payload), "metrics": metrics.model_dump()}


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
    coarse_payloads: Dict[int, Dict[str, Any]] = {}

    for idx, lst in enumerate(listings):
        zpid = _listing_key(lst)
        address = lst.get("address", "")
        price = _get_price(lst)
        listing_override = overrides_map.get(zpid)
        assumptions_for_listing = (
            merge_assumption_overrides(base_assumptions, listing_override) if listing_override else base_assumptions
        )
        ok, coarse = coarse_screen_one(lst, assumptions_for_listing)
        coarse_payloads[idx] = coarse["payload"]
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

            coarse_payload = coarse_payloads.get(idx)
            if coarse_payload is None:
                listing_override = overrides_map.get(zpid)
                assumptions_for_listing = (
                    merge_assumption_overrides(base_assumptions, listing_override)
                    if listing_override
                    else base_assumptions
                )
                coarse_payload = build_coarse_inputs(listings[idx], assumptions_for_listing)
            final_inputs = build_final_inputs(listings[idx], detail, coarse_payload)
            final_inputs_serialized = serialize_payload(final_inputs)

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
    if not underwriter_agent or not Runner:
        raise RuntimeError("Agent SDK is not available in this environment")
    msg = "Underwrite this listing and return UnderwriteOutput only:\n" + json.dumps(req.listing_payload)
    agent_result = await Runner.run(underwriter_agent, input=msg)
    return agent_result.final_output.model_dump()


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
    coarse_payload = build_coarse_inputs(listing, final_assumptions)
    final_inputs = build_final_inputs(listing, detail, coarse_payload)
    final_inputs_serialized = serialize_payload(final_inputs)
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
