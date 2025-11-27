import type { AssumptionOverrides, PipelineOptions, PropertySearchPayload } from '../api/types';
import type { ResultFilters } from '../types/ui';

export const defaultSearchValues: PropertySearchPayload = {
  location: 'CT',
  status_type: 'ForSale',
  home_type: 'Multi-family',
  max_price: 300000,
  limit: 25,
};

export const defaultAssumptionOverrides: AssumptionOverrides = {
  vacancy_rate_pct: 0.05,
  mgmt_fee_pct_of_egi: 0.08,
  interest_rate_annual: 0.07,
  loan_term_years: 30,
  down_payment_pct: 0.25,
  insurance_rate_of_value: 0.004,
  closing_costs_pct: 0.02,
  monthly_rent_override: null,
  tax_rate_pct: 0.021,
  taxes_annual_fixed: null,
  initial_repairs: 0,
  renovation_cost_estimate: 0,
  base_monthlies: {
    repairs_maintenance: 150,
    capex_reserve: 150,
    electric_common: 50,
    water_sewer: 0,
    trash: 0,
  },
};

export const cloneAssumptions = (input: AssumptionOverrides): AssumptionOverrides => ({
  ...input,
  base_monthlies: input.base_monthlies ? { ...input.base_monthlies } : input.base_monthlies,
});

export const buildDefaultPipelineOptions = (): PipelineOptions => ({
  fetch_details_for_promising: true,
  max_detail_fetches: 15,
  detail_sleep_sec: 0.4,
  use_agent_for_final: false,
  assumption_overrides: cloneAssumptions(defaultAssumptionOverrides),
});

const baseResultFilters: ResultFilters = {
  query: '',
  minBeds: null,
  maxPrice: null,
};

export const createDefaultResultFilters = (): ResultFilters => ({ ...baseResultFilters });
