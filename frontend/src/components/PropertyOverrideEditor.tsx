import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import type { AssumptionOverrides } from '../api/types';

const EXPENSE_FIELDS = [
  'water_sewer',
  'trash',
  'gas_landlord',
  'electric_common',
  'internet_common',
  'landscaping_snow',
  'pest_control',
  'repairs_maintenance',
  'capex_reserve',
  'hoa_condo_fee',
  'admin_legal_accounting',
  'miscellaneous',
] as const;

interface PropertyOverrideEditorProps {
  value?: AssumptionOverrides | null;
  baseline: AssumptionOverrides;
  onChange: (next: AssumptionOverrides | null) => void;
}

const formatLabel = (field: string) =>
  field
    .split('_')
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');

const toPercentDisplay = (value?: number | null) =>
  typeof value === 'number' && !Number.isNaN(value) ? (value * 100).toString() : '';

const PropertyOverrideEditor = ({ value, baseline, onChange }: PropertyOverrideEditorProps) => {
  const current: AssumptionOverrides = value ?? {};
  const baselineExpenses = baseline.base_monthlies ?? {};
  const currentExpenses = current.base_monthlies ?? {};
  const handleRentChange = (raw: string) => {
    if (!raw.trim()) {
      const next: AssumptionOverrides = { ...current };
      delete next.monthly_rent_override;
      if (Object.keys(next).length === 0) {
        onChange(null);
      } else {
        onChange(next);
      }
      return;
    }
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      return;
    }
    onChange({ ...current, monthly_rent_override: parsed });
  };

  const handleDownPaymentChange = (raw: string) => {
    if (!raw.trim()) {
      const next: AssumptionOverrides = { ...current };
      delete next.down_payment_pct;
      if (Object.keys(next).length === 0) {
        onChange(null);
      } else {
        onChange(next);
      }
      return;
    }
    const parsed = Number(raw) / 100;
    if (Number.isNaN(parsed)) {
      return;
    }
    onChange({ ...current, down_payment_pct: parsed });
  };

  const handleClosingCostsChange = (raw: string) => {
    if (!raw.trim()) {
      const next: AssumptionOverrides = { ...current };
      delete next.closing_costs_pct;
      if (Object.keys(next).length === 0) {
        onChange(null);
      } else {
        onChange(next);
      }
      return;
    }
    const parsed = Number(raw) / 100;
    if (Number.isNaN(parsed)) {
      return;
    }
    onChange({ ...current, closing_costs_pct: parsed });
  };

  const handleInitialRepairsChange = (raw: string) => {
    if (!raw.trim()) {
      const next: AssumptionOverrides = { ...current };
      delete next.initial_repairs;
      if (Object.keys(next).length === 0) {
        onChange(null);
      } else {
        onChange(next);
      }
      return;
    }
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      return;
    }
    onChange({ ...current, initial_repairs: parsed });
  };

  const handleExpenseChange = (field: string, raw: string) => {
    const next: AssumptionOverrides = { ...current };
    const base: Record<string, number> = {};
    Object.entries(currentExpenses).forEach(([key, val]) => {
      if (typeof val === 'number') {
        base[key] = val;
      }
    });
    if (!raw.trim()) {
      delete base[field];
    } else {
      const parsed = Number(raw);
      if (Number.isNaN(parsed)) {
        return;
      }
      base[field] = parsed;
    }
    if (Object.keys(base).length === 0) {
      delete next.base_monthlies;
    } else {
      next.base_monthlies = base;
    }
    if (Object.keys(next).length === 0) {
      onChange(null);
    } else {
      onChange(next);
    }
  };

  const hasOverrides =
    (current.monthly_rent_override != null && !Number.isNaN(current.monthly_rent_override)) ||
    (current.down_payment_pct != null && !Number.isNaN(current.down_payment_pct)) ||
    (current.closing_costs_pct != null && !Number.isNaN(current.closing_costs_pct)) ||
    (current.initial_repairs != null && !Number.isNaN(current.initial_repairs)) ||
    (current.base_monthlies && Object.keys(current.base_monthlies).length > 0);

  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" color="text.secondary">
        Customize rent and expense assumptions for this property only. Leave values blank to reuse your global defaults.
      </Typography>
      <TextField
        label="Monthly rent override ($)"
        value={current.monthly_rent_override ?? ''}
        onChange={(event) => handleRentChange(event.target.value)}
        type="number"
        inputProps={{ min: 0, step: 25 }}
        helperText="Blank = use rent estimate/global assumption"
        fullWidth
      />
      <TextField
        label="Down payment (%)"
        value={toPercentDisplay(current.down_payment_pct)}
        onChange={(event) => handleDownPaymentChange(event.target.value)}
        type="number"
        inputProps={{ min: 0, max: 100, step: 0.1 }}
        helperText={`Global: ${((baseline.down_payment_pct ?? 0) * 100).toFixed(1)}%`}
        fullWidth
      />
      <TextField
        label="Closing costs (%)"
        value={toPercentDisplay(current.closing_costs_pct)}
        onChange={(event) => handleClosingCostsChange(event.target.value)}
        type="number"
        inputProps={{ min: 0, max: 100, step: 0.1 }}
        helperText={`Global: ${((baseline.closing_costs_pct ?? 0) * 100).toFixed(1)}%`}
        fullWidth
      />
      <TextField
        label="Initial repairs ($)"
        value={current.initial_repairs ?? ''}
        onChange={(event) => handleInitialRepairsChange(event.target.value)}
        type="number"
        inputProps={{ min: 0, step: 100 }}
        helperText={`Global: $${(baseline.initial_repairs ?? 0).toLocaleString()}`}
        fullWidth
      />
      <Typography variant="subtitle2">Monthly expenses</Typography>
      <Box
        sx={{
          display: 'grid',
          gap: 1,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
        }}
      >
        {EXPENSE_FIELDS.map((field) => {
          const baselineValueRaw = baselineExpenses?.[field];
          const baselineValue = typeof baselineValueRaw === 'number' ? baselineValueRaw : 0;
          const overrideValue = currentExpenses?.[field];
          return (
            <TextField
              key={field}
              label={`${formatLabel(field)} ($/mo)`}
              value={overrideValue ?? ''}
              placeholder={baselineValueRaw != null ? baselineValueRaw.toString() : undefined}
              helperText={`Global: $${baselineValue.toLocaleString()}`}
              type="number"
              inputProps={{ min: 0, step: 25 }}
              onChange={(event) => handleExpenseChange(field, event.target.value)}
            />
          );
        })}
      </Box>
      <Button variant="text" color="inherit" disabled={!hasOverrides} onClick={() => onChange(null)} sx={{ alignSelf: 'flex-start' }}>
        Clear property overrides
      </Button>
      <Typography variant="caption" color="text.secondary">
        Changes auto-apply to this row after a short pause.
      </Typography>
    </Stack>
  );
};

export default PropertyOverrideEditor;
