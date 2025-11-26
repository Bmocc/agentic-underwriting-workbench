import { Box, Button, Divider, Stack, TextField, Typography } from '@mui/material';
import type { AssumptionOverrides, MonthlyExpensesShape } from '../api/types';

interface AssumptionControlsProps {
  value: AssumptionOverrides;
  defaults: AssumptionOverrides;
  onChange: (value: AssumptionOverrides) => void;
  onReset: () => void;
}

const percentToDisplay = (value: number | null | undefined, fallback: number) =>
  (((value ?? fallback) ?? 0) * 100).toString();

const AssumptionControls = ({ value, defaults, onChange, onReset }: AssumptionControlsProps) => {
  const current = value ?? {};
  const baseMonthlies: MonthlyExpensesShape = {};
  Object.entries(defaults.base_monthlies ?? {}).forEach(([key, val]) => {
    if (typeof val === 'number') {
      baseMonthlies[key] = val;
    }
  });
  Object.entries(current.base_monthlies ?? {}).forEach(([key, val]) => {
    if (typeof val === 'number') {
      baseMonthlies[key] = val;
    }
  });

  const handlePercentChange = (key: keyof AssumptionOverrides, raw: string) => {
    if (!raw.trim()) {
      const next = { ...current };
      delete next[key];
      onChange(next);
      return;
    }
    const parsed = Number(raw) / 100;
    if (Number.isNaN(parsed)) {
      return;
    }
    onChange({ ...current, [key]: parsed });
  };

  const handleNumberChange = (key: keyof AssumptionOverrides, raw: string) => {
    if (!raw.trim()) {
      const next = { ...current };
      delete next[key];
      onChange(next);
      return;
    }
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      return;
    }
    onChange({ ...current, [key]: parsed });
  };

  const handleMonthlyExpenseChange = (field: keyof MonthlyExpensesShape, raw: string) => {
    const base = { ...(current.base_monthlies ?? {}) };
    if (!raw.trim()) {
      delete base[field];
    } else {
      const parsed = Number(raw);
      if (Number.isNaN(parsed)) {
        return;
      }
      base[field] = parsed;
    }
    onChange({ ...current, base_monthlies: base });
  };

  return (
    <Stack spacing={2}>
      <Box>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'flex-start', md: 'center' }}>
          <Box>
            <Typography variant="subtitle1">Underwriting Assumptions</Typography>
            <Typography variant="body2" color="text.secondary">
              Customize the economic inputs (vacancy, debt, expenses, taxes, etc.) used for coarse scoring.
            </Typography>
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          <Button size="small" onClick={onReset}>
            Reset to defaults
          </Button>
        </Stack>
      </Box>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' },
        }}
      >
        <TextField
          label="Vacancy (%)"
          value={percentToDisplay(current.vacancy_rate_pct, defaults.vacancy_rate_pct ?? 0)}
          onChange={(event) => handlePercentChange('vacancy_rate_pct', event.target.value)}
          type="number"
          inputProps={{ min: 0, max: 100, step: 0.1 }}
          fullWidth
        />
        <TextField
          label="Mgmt Fee (%)"
          value={percentToDisplay(current.mgmt_fee_pct_of_egi, defaults.mgmt_fee_pct_of_egi ?? 0)}
          onChange={(event) => handlePercentChange('mgmt_fee_pct_of_egi', event.target.value)}
          type="number"
          inputProps={{ min: 0, max: 100, step: 0.1 }}
          fullWidth
        />
        <TextField
          label="Monthly rent override ($)"
          value={(current.monthly_rent_override ?? '').toString()}
          onChange={(event) => handleNumberChange('monthly_rent_override', event.target.value)}
          type="number"
          inputProps={{ min: 0, step: 50 }}
          fullWidth
          helperText="Leave blank to use Zillow rent estimate"
        />
        <TextField
          label="Tax Rate (% of price)"
          value={percentToDisplay(current.tax_rate_pct, defaults.tax_rate_pct ?? 0.0)}
            onChange={(event) => handlePercentChange('tax_rate_pct', event.target.value)}
            type="number"
            inputProps={{ min: 0, max: 100, step: 0.1 }}
          fullWidth
          helperText="Overrides state guess; leave blank to auto-estimate"
        />
        <TextField
          label="Interest Rate (%)"
          value={percentToDisplay(current.interest_rate_annual, defaults.interest_rate_annual ?? 0)}
            onChange={(event) => handlePercentChange('interest_rate_annual', event.target.value)}
            type="number"
          inputProps={{ min: 0, max: 100, step: 0.1 }}
          fullWidth
        />
        <TextField
          label="Loan Term (years)"
          value={(current.loan_term_years ?? defaults.loan_term_years ?? 30).toString()}
            onChange={(event) => handleNumberChange('loan_term_years', event.target.value)}
            type="number"
          inputProps={{ min: 1, step: 1 }}
          fullWidth
        />
        <TextField
          label="Down Payment (%)"
          value={percentToDisplay(current.down_payment_pct, defaults.down_payment_pct ?? 0)}
            onChange={(event) => handlePercentChange('down_payment_pct', event.target.value)}
            type="number"
          inputProps={{ min: 0, max: 100, step: 0.1 }}
          fullWidth
        />
        <TextField
          label="Insurance Rate (% of price)"
          value={percentToDisplay(current.insurance_rate_of_value, defaults.insurance_rate_of_value ?? 0)}
            onChange={(event) => handlePercentChange('insurance_rate_of_value', event.target.value)}
            type="number"
          inputProps={{ min: 0, max: 100, step: 0.05 }}
          fullWidth
        />
        <TextField
          label="Closing Costs (%)"
          value={percentToDisplay(current.closing_costs_pct, defaults.closing_costs_pct ?? 0)}
            onChange={(event) => handlePercentChange('closing_costs_pct', event.target.value)}
            type="number"
          inputProps={{ min: 0, max: 100, step: 0.1 }}
          fullWidth
        />
        <TextField
          label="Annual Tax Override ($)"
          value={(current.taxes_annual_fixed ?? '').toString()}
            onChange={(event) => handleNumberChange('taxes_annual_fixed', event.target.value)}
            type="number"
            inputProps={{ min: 0, step: 100 }}
          fullWidth
          helperText="Leave blank to use rate/state heuristic"
        />
      </Box>
      <Divider />
      <Typography variant="subtitle2">Monthly Expense Overrides</Typography>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' },
        }}
      >
        {Object.entries(baseMonthlies).map(([key, defaultValue]) => (
          <Box key={key}>
            <TextField
              label={`${key.replace(/_/g, ' ')} ($/mo)`}
              value={(current.base_monthlies?.[key] ?? defaultValue ?? 0).toString()}
              onChange={(event) => handleMonthlyExpenseChange(key, event.target.value)}
              type="number"
              inputProps={{ min: 0, step: 25 }}
              fullWidth
            />
          </Box>
        ))}
      </Box>
    </Stack>
  );
};

export default AssumptionControls;
