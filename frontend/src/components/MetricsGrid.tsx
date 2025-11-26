import { Paper, Typography } from '@mui/material';
import Grid from '@mui/material/Grid';
import type { UnderwriteMetrics } from '../api/types';

interface MetricsGridProps {
  metrics?: UnderwriteMetrics | Record<string, number> | null;
  title?: string;
}

const percentKeys = new Set(['cap_rate', 'cash_on_cash', 'breakeven_occupancy', 'expense_ratio']);
const currencyKeys = new Set(['gsr_monthly', 'egi_monthly', 'operating_expenses_monthly', 'noi_annual', 'debt_service_annual', 'cash_invested', 'cash_flow_annual', 'cash_flow_monthly']);

const labelMap: Record<string, string> = {
  gsr_monthly: 'GSR (Monthly)',
  egi_monthly: 'EGI (Monthly)',
  operating_expenses_monthly: 'OpEx (Monthly)',
  noi_annual: 'NOI (Annual)',
  debt_service_annual: 'Debt Service (Annual)',
  cash_invested: 'Cash Invested',
  cash_flow_annual: 'Cash Flow (Annual)',
  cash_flow_monthly: 'Cash Flow (Monthly)',
  cap_rate: 'Cap Rate',
  cash_on_cash: 'Cash-on-Cash',
  dscr: 'DSCR',
  breakeven_occupancy: 'Breakeven Occ.',
  grm: 'GRM',
  price_per_unit: 'Price / Unit',
  expense_ratio: 'Expense Ratio',
};

const formatValue = (key: string, value: number) => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '—';
  }
  if (currencyKeys.has(key)) {
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  if (percentKeys.has(key)) {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (key === 'dscr') {
    return value.toFixed(2);
  }
  if (key === 'price_per_unit') {
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  if (key === 'grm') {
    return value.toFixed(2);
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const MetricsGrid = ({ metrics, title }: MetricsGridProps) => {
  if (!metrics) {
    return null;
  }

  return (
    <>
      {title ? (
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          {title}
        </Typography>
      ) : null}
      <Grid container spacing={1}>
        {Object.entries(labelMap).map(([key, label]) => (
          <Grid key={key} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                {label}
              </Typography>
              <Typography variant="subtitle2">{formatValue(key, Number((metrics as any)[key]))}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </>
  );
};

export default MetricsGrid;
