import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import type {
  AssumptionOverrides,
  FinalAnalysisResponse,
  PipelineRow,
  PropertyListing,
  UnderwriteOutput,
} from '../api/types';
import MetricsGrid from './MetricsGrid';
import PropertyOverrideEditor from './PropertyOverrideEditor';

interface DetailDrawerProps {
  open: boolean;
  onClose: () => void;
  listing?: PropertyListing;
  row?: PipelineRow;
  agentOutput?: UnderwriteOutput;
  finalDetail?: FinalAnalysisResponse;
  propertyOverride?: AssumptionOverrides | null;
  onPropertyOverrideChange?: (next: AssumptionOverrides | null) => void;
  baselineAssumptions: AssumptionOverrides;
}

const formatCurrency = (value: number | null | undefined, opts: { suffix?: string } = {}) =>
  typeof value === 'number' && Number.isFinite(value)
    ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}${opts.suffix ?? ''}`
    : '—';

const titleCase = (text: string) =>
  text
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const DEFAULT_DPCT = 0.25;

const DetailDrawer = ({
  open,
  onClose,
  listing,
  row,
  agentOutput,
  finalDetail,
  propertyOverride,
  onPropertyOverrideChange,
  baselineAssumptions,
}: DetailDrawerProps) => {
  const metrics = row?.final_metrics ?? row?.coarse_metrics;
  const inputs = (row?.final_inputs ?? row?.coarse_inputs) as Record<string, any> | undefined;
  const monthlyExpenses: Record<string, number> = inputs?.monthly_expenses ?? {};
  const gsrMonthly = typeof metrics?.gsr_monthly === 'number' ? metrics.gsr_monthly : null;
  const vacancyRate = typeof inputs?.vacancy_rate_pct === 'number' ? inputs.vacancy_rate_pct : 0;
  const vacancyLoss = gsrMonthly != null ? gsrMonthly * vacancyRate : null;
  const otherIncome = typeof inputs?.other_income_monthly === 'number' ? inputs.other_income_monthly : 0;
  const egiMonthly =
    typeof metrics?.egi_monthly === 'number' ? metrics.egi_monthly : (gsrMonthly ?? 0) - (vacancyLoss ?? 0) + otherIncome;
  const mgmtFee = egiMonthly * (typeof inputs?.mgmt_fee_pct_of_egi === 'number' ? inputs.mgmt_fee_pct_of_egi : 0);
  const taxesMonthly = (typeof inputs?.taxes_annual === 'number' ? inputs.taxes_annual : 0) / 12;
  const insuranceMonthly = (typeof inputs?.insurance_annual === 'number' ? inputs.insurance_annual : 0) / 12;
  const debtMonthly = typeof metrics?.debt_service_annual === 'number' ? metrics.debt_service_annual / 12 : null;
  const monthlyExpenseLines = [
    { label: 'Property taxes', value: taxesMonthly },
    { label: 'Insurance', value: insuranceMonthly },
    { label: 'Management fee', value: mgmtFee },
    ...Object.entries(monthlyExpenses).map(([key, value]) => ({ label: titleCase(key), value })),
  ];
  const totalOperatingExpensesMonthly = monthlyExpenseLines.reduce(
    (sum, item) => sum + (typeof item.value === 'number' ? item.value : 0),
    0
  );
  const listingPrice =
    typeof listing?.price === 'number'
      ? listing.price
      : typeof row?.price === 'number'
        ? row.price
        : typeof inputs?.purchase_price === 'number'
          ? inputs.purchase_price
          : null;
  const downPaymentPct =
    (typeof inputs?.down_payment_pct === 'number' ? inputs.down_payment_pct : null) ??
    (propertyOverride?.down_payment_pct ?? baselineAssumptions.down_payment_pct ?? DEFAULT_DPCT);
  const downPaymentAmount = listingPrice != null && typeof downPaymentPct === 'number' ? listingPrice * downPaymentPct : null;

  const zpid = listing?.zpid ?? row?.zpid;
  const canEditOverrides = Boolean(zpid && onPropertyOverrideChange);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ pr: 6 }}>
        <Typography variant="h6">Property Detail</Typography>
        <Typography variant="body2" color="text.secondary">
          {listing?.address ?? row?.address ?? 'Address unavailable'}
        </Typography>
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 12, top: 12 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ maxHeight: '80vh' }}>
        <Stack spacing={2}>
          {listing ? (
            <Stack spacing={0.5}>
              <Typography variant="subtitle2">Key Facts</Typography>
              <Typography variant="body2">ZPID: {listing.zpid}</Typography>
              <Typography variant="body2">Price: {listing.price ? `$${listing.price.toLocaleString()}` : 'N/A'}</Typography>
              <Typography variant="body2">
                Beds / Baths: {listing.bedrooms ?? '—'} / {listing.bathrooms ?? '—'}
              </Typography>
              <Typography variant="body2">Living Area: {listing.livingArea ?? '—'} sqft</Typography>
            </Stack>
          ) : null}
          <Divider />
          <MetricsGrid metrics={metrics as any} title="Current Metrics" />
          {inputs ? (
            <Box>
              <Typography variant="subtitle1">Income & Expense Breakdown</Typography>
              <Box sx={{ mt: 1.5 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Monthly Income
                </Typography>
                <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2">Gross scheduled rent</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {formatCurrency(gsrMonthly)}
                    </Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2">Vacancy ({(vacancyRate * 100).toFixed(1)}%)</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {vacancyLoss != null ? `-${formatCurrency(vacancyLoss).replace('$', '')}` : '—'}
                    </Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2">Other income</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {formatCurrency(otherIncome)}
                    </Typography>
                  </Stack>
                  <Divider flexItem sx={{ my: 0.5 }} />
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" fontWeight={600}>
                      Effective gross income
                    </Typography>
                    <Typography variant="body2" fontWeight={700}>
                      {formatCurrency(egiMonthly)}
                    </Typography>
                  </Stack>
                </Stack>
              </Box>
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Monthly Operating Expenses
                </Typography>
                <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                  {monthlyExpenseLines.map((item) => (
                    <Stack direction="row" justifyContent="space-between" key={item.label}>
                      <Typography variant="body2">{item.label}</Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {formatCurrency(item.value)}
                      </Typography>
                    </Stack>
                  ))}
                  <Divider flexItem sx={{ my: 0.5 }} />
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" fontWeight={600}>
                      Total operating expenses
                    </Typography>
                    <Typography variant="body2" fontWeight={700}>
                      {formatCurrency(totalOperatingExpensesMonthly)}
                    </Typography>
                  </Stack>
                </Stack>
              </Box>
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Summary
                </Typography>
                <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2">NOI (annual)</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {formatCurrency(metrics?.noi_annual)}
                    </Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2">Debt service (annual)</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {formatCurrency(metrics?.debt_service_annual)}
                    </Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2">Debt service (monthly)</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {formatCurrency(debtMonthly)}
                    </Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2">Cash flow (annual)</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {formatCurrency(metrics?.cash_flow_annual)}
                    </Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2">Cash flow (monthly)</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {formatCurrency(metrics?.cash_flow_monthly)}
                    </Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2">Down payment</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {formatCurrency(downPaymentAmount, {
                        suffix: downPaymentPct ? ` (${(downPaymentPct * 100).toFixed(1)}%)` : '',
                      })}
                    </Typography>
                  </Stack>
                </Stack>
              </Box>
            </Box>
          ) : null}
          {canEditOverrides ? (
            <Box>
              <Typography variant="subtitle1">Per-property overrides</Typography>
              <PropertyOverrideEditor
                value={propertyOverride}
                baseline={baselineAssumptions}
                onChange={(next) => onPropertyOverrideChange?.(next)}
              />
            </Box>
          ) : null}
          {agentOutput ? (
            <Box>
              <Typography variant="subtitle1">Agent Verdict</Typography>
              <Typography variant="body2" color={agentOutput.passes_filters ? 'success.main' : 'warning.main'}>
                {agentOutput.passes_filters ? 'Passes filters' : 'Does not pass filters'}
              </Typography>
              <Typography variant="body2">Reasons: {agentOutput.reasons.join(', ')}</Typography>
            </Box>
          ) : null}
          {finalDetail ? (
            <Box>
              <Typography variant="subtitle1">Full Detail Payload</Typography>
              <Accordion sx={{ mt: 1 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="body2">Rapid API Detail JSON</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Box component="pre" sx={{ maxHeight: 240, overflow: 'auto', fontSize: 12, bgcolor: 'grey.100', p: 2 }}>
                    {JSON.stringify(finalDetail.detail, null, 2)}
                  </Box>
                </AccordionDetails>
              </Accordion>
              <Accordion sx={{ mt: 1 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="body2">Final Tool Inputs</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Box component="pre" sx={{ maxHeight: 240, overflow: 'auto', fontSize: 12, bgcolor: 'grey.100', p: 2 }}>
                    {JSON.stringify(finalDetail.final_inputs, null, 2)}
                  </Box>
                </AccordionDetails>
              </Accordion>
            </Box>
          ) : null}
        </Stack>
      </DialogContent>
    </Dialog>
  );
};

export default DetailDrawer;
