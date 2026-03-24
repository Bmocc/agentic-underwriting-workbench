import type { AssumptionOverrides, PipelineOptions, PropertySearchPayload, UnderwritingConfig } from '../api/types';
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
  // Intentionally differs from backend ASSUMPTIONS (null) — CT local market default
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

export function buildAssumptionsFromConfig(config: UnderwritingConfig): AssumptionOverrides {
  const a = config.assumptions;
  return {
    vacancy_rate_pct: a.vacancy_rate_pct,
    mgmt_fee_pct_of_egi: a.mgmt_fee_pct_of_egi,
    interest_rate_annual: a.interest_rate_annual,
    loan_term_years: a.loan_term_years,
    down_payment_pct: a.down_payment_pct,
    insurance_rate_of_value: a.insurance_rate_of_value,
    closing_costs_pct: a.closing_costs_pct,
    monthly_rent_override: a.monthly_rent_override,
    tax_rate_pct: a.tax_rate_pct,
    taxes_annual_fixed: a.taxes_annual_fixed,
    initial_repairs: a.initial_repairs,
    renovation_cost_estimate: a.renovation_cost_estimate,
    base_monthlies: { ...a.base_monthlies },
  };
}
