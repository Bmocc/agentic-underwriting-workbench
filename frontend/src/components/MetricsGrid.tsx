import { Box, Paper, Typography } from '@mui/material';
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

const formatValue = (key: string, rawValue?: number | null) => {
  const value = typeof rawValue === 'number' ? rawValue : null;
  if (value === null || Number.isNaN(value)) {
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

  const entries = Object.entries(labelMap);

  return (
    <>
      {title ? (
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          {title}
        </Typography>
      ) : null}
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          borderRadius: 2,
          bgcolor: 'background.paper',
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, minmax(0, 1fr))',
              sm: 'repeat(3, minmax(0, 1fr))',
              md: 'repeat(4, minmax(0, 1fr))',
              lg: 'repeat(5, minmax(0, 1fr))',
            },
            gap: 1,
          }}
        >
          {entries.map(([key, label]) => (
            <Box
              key={key}
              sx={{
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider',
                px: 1.25,
                py: 0.75,
                minHeight: 60,
                display: 'flex',
                flexDirection: 'column',
                gap: 0.25,
                bgcolor: 'background.default',
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, letterSpacing: 0.3 }}>
                {label}
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {formatValue(key, (metrics as Record<string, number | undefined>)[key])}
              </Typography>
            </Box>
          ))}
        </Box>
      </Paper>
    </>
  );
};

export default MetricsGrid;
