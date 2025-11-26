from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, ConfigDict


class UnitItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    unit_type: str = Field(..., description="Label for the unit grouping")
    count: int = Field(..., ge=0, description="Number of units")
    rent: float = Field(..., ge=0, description="Monthly rent per unit")


class MonthlyExpenses(BaseModel):
    model_config = ConfigDict(extra="forbid")

    water_sewer: float = 0.0
    trash: float = 0.0
    gas_landlord: float = 0.0
    electric_common: float = 0.0
    internet_common: float = 0.0
    landscaping_snow: float = 0.0
    pest_control: float = 0.0
    repairs_maintenance: float = 0.0
    capex_reserve: float = 0.0
    hoa_condo_fee: float = 0.0
    admin_legal_accounting: float = 0.0
    miscellaneous: float = 0.0

    def total(self) -> float:
        return sum(self.model_dump().values())


class UnderwriteMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    gsr_monthly: float
    egi_monthly: float
    operating_expenses_monthly: float
    noi_annual: float
    debt_service_annual: float
    cash_invested: float
    cash_flow_annual: float
    cash_flow_monthly: float
    cap_rate: float
    cash_on_cash: float
    dscr: float
    breakeven_occupancy: float
    grm: float
    price_per_unit: float
    expense_ratio: float


class UnderwriteOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    address: Optional[str] = None
    zpid: Optional[int] = None
    passes_filters: bool
    reasons: List[str]
    metrics: UnderwriteMetrics


class UnderwriteRequest(BaseModel):
    purchase_price: float
    closing_costs: float = 0.0
    initial_repairs: float = 0.0
    down_payment_pct: float = 0.25
    interest_rate_annual: float = 0.07
    loan_term_years: int = 30
    vacancy_rate_pct: float = 0.05
    mgmt_fee_pct_of_egi: float = 0.08
    taxes_annual: float = 0.0
    insurance_annual: float = 0.0
    other_income_monthly: float = 0.0
    monthly_expenses: MonthlyExpenses = Field(default_factory=MonthlyExpenses)
    unit_mix: List[UnitItem] = Field(default_factory=lambda: [UnitItem(unit_type="Total", count=1, rent=0.0)])


class PropertySearchRequest(BaseModel):
    location: str = Field(..., description="Zillow search location, e.g. city or state")
    status_type: str = Field("ForSale", description="Zillow status filter")
    home_type: str = Field("Multi-family", description="Home type filter")
    min_price: Optional[int] = Field(None, description="Minimum list price")
    max_price: Optional[int] = Field(None, description="Maximum list price")
    beds_min: Optional[int] = None
    baths_min: Optional[int] = None
    limit: int = Field(46, description="Maximum results to request")


class PropertyDetailRequest(BaseModel):
    zpid: str


class PropertySearchResponse(BaseModel):
    props: List[Dict[str, Any]] = Field(default_factory=list)
    total_result_count: Optional[int] = None
    raw: Dict[str, Any] = Field(default_factory=dict)
    search_id: Optional[int] = None


class SearchHistoryEntry(BaseModel):
    id: int
    created_at: str
    location: Optional[str] = None
    status_type: Optional[str] = None
    home_type: Optional[str] = None
    limit: Optional[int] = None
    result_count: int = 0
    request_payload: Dict[str, Any]


class SearchHistoryListResponse(BaseModel):
    history: List[SearchHistoryEntry]


class PipelineRunHistoryEntry(BaseModel):
    id: int
    created_at: str
    search_id: Optional[int] = None
    label: Optional[str] = None
    result_count: int
    options: Dict[str, Any]


class PipelineRunHistoryResponse(BaseModel):
    history: List[PipelineRunHistoryEntry]


class AssumptionOverrides(BaseModel):
    vacancy_rate_pct: Optional[float] = None
    mgmt_fee_pct_of_egi: Optional[float] = None
    interest_rate_annual: Optional[float] = None
    loan_term_years: Optional[int] = None
    down_payment_pct: Optional[float] = None
    insurance_rate_of_value: Optional[float] = None
    closing_costs_pct: Optional[float] = None
    monthly_rent_override: Optional[float] = None
    tax_rate_pct: Optional[float] = None
    taxes_annual_fixed: Optional[float] = None
    base_monthlies: Optional[MonthlyExpenses] = None


class PipelineOptions(BaseModel):
    fetch_details_for_promising: bool = True
    max_detail_fetches: int = 15
    detail_sleep_sec: float = 0.4
    use_agent_for_final: bool = False
    assumption_overrides: Optional[AssumptionOverrides] = None


class PipelineRunRequest(BaseModel):
    listings: List[dict]
    options: PipelineOptions = Field(default_factory=PipelineOptions)
    search_id: Optional[int] = None
    label: Optional[str] = None
    listing_overrides: Optional[Dict[str, AssumptionOverrides]] = None
    skip_history: bool = False


class PipelineRunResponse(BaseModel):
    results: List[dict]
    run_id: Optional[int] = None


class AgentToggleRequest(BaseModel):
    listing_payload: dict
    zpid: Optional[str] = None
    use_agent: bool = True
    force: bool = False


class FinalAnalysisRequest(BaseModel):
    listing: Dict[str, Any]
    zpid: str
    use_agent: bool = False
    force: bool = False
    assumption_overrides: Optional[AssumptionOverrides] = None
    listing_override: Optional[AssumptionOverrides] = None


class FinalAnalysisResponse(BaseModel):
    detail: Dict[str, Any]
    final_inputs: Dict[str, Any]
    metrics: UnderwriteMetrics
    agent_output: Optional[UnderwriteOutput] = None
