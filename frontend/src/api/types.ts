export interface PropertySearchPayload {
  location: string;
  status_type?: string;
  home_type?: string;
  min_price?: number | null;
  max_price?: number | null;
  beds_min?: number | null;
  baths_min?: number | null;
  limit?: number | null;
}

export interface PropertyListing {
  zpid: string;
  address?: string;
  price?: number;
  rentZestimate?: number;
  zestimate?: number;
  bedrooms?: number;
  bathrooms?: number;
  livingArea?: number;
  [key: string]: unknown;
}

export interface SearchResponse {
  props: PropertyListing[];
  total_result_count?: number | null;
  raw: Record<string, unknown>;
  search_id?: number | null;
  pipeline_results?: PipelineRow[] | null;
  pipeline_options?: PipelineOptions | null;
  pipeline_label?: string | null;
  pipeline_run_at?: string | null;
  property_overrides?: Record<string, AssumptionOverrides | null> | null;
}

export interface SearchHistoryEntry {
  id: number;
  created_at: string;
  location?: string | null;
  status_type?: string | null;
  home_type?: string | null;
  limit?: number | null;
  result_count: number;
  request_payload: PropertySearchPayload;
  pipeline_run_at?: string | null;
  pipeline_label?: string | null;
  pipeline_result_count?: number | null;
}

export interface SearchHistoryResponse {
  history: SearchHistoryEntry[];
}

export interface MonthlyExpensesShape {
  [key: string]: number;
}

export interface AssumptionOverrides {
  vacancy_rate_pct?: number | null;
  mgmt_fee_pct_of_egi?: number | null;
  interest_rate_annual?: number | null;
  loan_term_years?: number | null;
  down_payment_pct?: number | null;
  insurance_rate_of_value?: number | null;
  closing_costs_pct?: number | null;
  monthly_rent_override?: number | null;
  tax_rate_pct?: number | null;
  taxes_annual_fixed?: number | null;
  initial_repairs?: number | null;
  renovation_cost_estimate?: number | null;
  base_monthlies?: Partial<MonthlyExpensesShape> | null;
}

export interface UnitItemShape {
  unit_type: string;
  count: number;
  rent: number;
}

export interface UnderwriteRequestPayload {
  purchase_price: number;
  closing_costs?: number;
  initial_repairs?: number;
  down_payment_pct?: number;
  interest_rate_annual?: number;
  loan_term_years?: number;
  vacancy_rate_pct?: number;
  mgmt_fee_pct_of_egi?: number;
  taxes_annual?: number;
  insurance_annual?: number;
  other_income_monthly?: number;
  monthly_expenses?: MonthlyExpensesShape;
  unit_mix?: UnitItemShape[];
}

export interface UnderwriteMetrics {
  gsr_monthly: number;
  egi_monthly: number;
  operating_expenses_monthly: number;
  noi_annual: number;
  debt_service_annual: number;
  cash_invested: number;
  cash_flow_annual: number;
  cash_flow_monthly: number;
  cap_rate: number;
  cash_on_cash: number;
  dscr: number;
  breakeven_occupancy: number;
  grm: number;
  price_per_unit: number;
  expense_ratio: number;
}

export interface SourceReference {
  title: string;
  url: string;
}

export interface UnderwriteOutput {
  address?: string | null;
  zpid?: number | null;
  passes_filters: boolean;
  reasons: string[];
  metrics: UnderwriteMetrics;
  response?: string | null;
  summary?: string | null;
  sources?: SourceReference[] | null;
}

export interface PipelineOptions {
  fetch_details_for_promising: boolean;
  max_detail_fetches: number;
  detail_sleep_sec: number;
  use_agent_for_final: boolean;
  assumption_overrides?: AssumptionOverrides | null;
}

export interface PipelineRunRequest {
  listings: PropertyListing[];
  options: PipelineOptions;
  search_id?: number | null;
  label?: string | null;
  listing_overrides?: Record<string, AssumptionOverrides> | null;
  skip_history?: boolean;
}

export interface PipelineRow {
  idx: number;
  zpid: string;
  address?: string;
  price?: number;
  stage: 'coarse' | 'final';
  coarse_metrics: UnderwriteMetrics | Record<string, number>;
  final_metrics?: UnderwriteMetrics | Record<string, number> | null;
  coarse_inputs?: Record<string, unknown> | null;
  final_inputs?: Record<string, unknown> | null;
  detail_fetched: boolean;
  detail_error?: string;
  agent_passes_filters?: boolean;
  agent_reasons?: string[];
}

export interface AgentRunPayload {
  zpid: string;
  listing_payload: Record<string, unknown>;
  force?: boolean;
  use_agent?: boolean;
  question?: string;
  chat_history?: Array<{ role: string; content: string }>;
}

export interface FinalAnalysisPayload {
  zpid: string;
  listing: PropertyListing;
  use_agent?: boolean;
  force?: boolean;
  assumption_overrides?: AssumptionOverrides | null;
  listing_override?: AssumptionOverrides | null;
}

export interface FinalAnalysisResponse {
  zpid: string;
  detail: Record<string, unknown>;
  final_inputs: Record<string, unknown>;
  metrics: UnderwriteMetrics;
  agent_output?: UnderwriteOutput;
}

export interface PipelineRunResponse {
  results: PipelineRow[];
  run_id?: number | null;
}

export interface AgentChatMessage {
  id: string;
  role: 'system' | 'user' | 'agent';
  content: string;
  timestamp: number;
  sources?: SourceReference[] | null;
}

export interface PropertyOverridePayload {
  zpid: string;
  search_id?: number | null;
  overrides?: AssumptionOverrides | null;
}

export interface PropertyOverridesResponse {
  overrides: Record<string, AssumptionOverrides | null>;
}

export interface AgentConversationResponse {
  zpid: string;
  messages: AgentChatMessage[];
  property_snapshot?: Record<string, unknown> | null;
  pipeline_inputs?: Record<string, unknown> | null;
  search_id?: number | null;
  updated_at?: string | null;
}

export interface AgentConversationRequest {
  question: string;
  listing_payload: Record<string, unknown>;
  search_id?: number | null;
}
