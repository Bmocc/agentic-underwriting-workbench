import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CalculateIcon from '@mui/icons-material/Calculate';
import { useEffect, useState, useCallback } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  TextField,
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
import CalcPad from './CalcPad';

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

type ValueEditorType = 'currency' | 'percent' | 'number' | 'monthlyToAnnual' | 'ratioOfPrice';

interface ValueEditorState {
  label: string;
  path: string;
  type: ValueEditorType;
  value: number | null;
  helper?: string;
}

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
  const cloneOverride = (input?: AssumptionOverrides | null) =>
    input ? (JSON.parse(JSON.stringify(input)) as AssumptionOverrides) : null;
  const serializeOverride = (input?: AssumptionOverrides | null) => JSON.stringify(input ?? null);

  const [valueEditor, setValueEditor] = useState<ValueEditorState | null>(null);
  const [valueDraft, setValueDraft] = useState('');
  const [valueError, setValueError] = useState<string | null>(null);
  const [showCalculator, setShowCalculator] = useState(false);
  const [calcExpression, setCalcExpression] = useState('');
  const [calcResult, setCalcResult] = useState<string>('');
  const [calcError, setCalcError] = useState<string | null>(null);
  const [overrideDraft, setOverrideDraft] = useState<AssumptionOverrides | null>(() =>
    cloneOverride(propertyOverride)
  );
  const [baselineSerialized, setBaselineSerialized] = useState(() => serializeOverride(propertyOverride));
  const [hasPendingChanges, setHasPendingChanges] = useState(false);

  const metrics = row?.final_metrics ?? row?.coarse_metrics;
  const workingOverride = overrideDraft;
  const inputs = (row?.final_inputs ?? row?.coarse_inputs) as Record<string, any> | undefined;
  const monthlyExpenses: Record<string, number> = inputs?.monthly_expenses ?? {};
  const gsrMonthly = typeof metrics?.gsr_monthly === 'number' ? metrics.gsr_monthly : null;
  const vacancyRate = typeof inputs?.vacancy_rate_pct === 'number' ? inputs.vacancy_rate_pct : 0;
  const otherIncome = typeof inputs?.other_income_monthly === 'number' ? inputs.other_income_monthly : 0;
  const listingPrice =
    typeof listing?.price === 'number'
      ? listing.price
      : typeof row?.price === 'number'
        ? row.price
        : typeof inputs?.purchase_price === 'number'
          ? inputs.purchase_price
          : null;
  const displayGsrMonthly =
    typeof workingOverride?.monthly_rent_override === 'number'
      ? workingOverride.monthly_rent_override
      : gsrMonthly;
  const displayVacancyRate =
    workingOverride?.vacancy_rate_pct ??
    inputs?.vacancy_rate_pct ??
    baselineAssumptions.vacancy_rate_pct ??
    0;
  const vacancyLoss =
    displayGsrMonthly != null ? displayGsrMonthly * displayVacancyRate : gsrMonthly != null ? gsrMonthly * vacancyRate : null;
  const displayOtherIncome = otherIncome;
  const displayEgiMonthly =
    (displayGsrMonthly ?? gsrMonthly ?? 0) - (vacancyLoss ?? 0) + (displayOtherIncome ?? otherIncome ?? 0);
  const priceBasis = listingPrice ?? inputs?.purchase_price ?? null;
  const effectiveTaxesAnnual =
    typeof workingOverride?.taxes_annual_fixed === 'number'
      ? workingOverride.taxes_annual_fixed
      : typeof inputs?.taxes_annual === 'number'
        ? inputs.taxes_annual
        : null;
  const taxesMonthly = effectiveTaxesAnnual != null ? effectiveTaxesAnnual / 12 : null;
  const effectiveInsuranceAnnual =
    typeof workingOverride?.insurance_rate_of_value === 'number' && priceBasis
      ? workingOverride.insurance_rate_of_value * priceBasis
      : typeof inputs?.insurance_annual === 'number'
        ? inputs.insurance_annual
        : null;
  const insuranceMonthly = effectiveInsuranceAnnual != null ? effectiveInsuranceAnnual / 12 : null;
  const effectiveMgmtPct =
    workingOverride?.mgmt_fee_pct_of_egi ??
    inputs?.mgmt_fee_pct_of_egi ??
    baselineAssumptions.mgmt_fee_pct_of_egi ??
    0;
  const mgmtFee = displayEgiMonthly * effectiveMgmtPct;
  const mergedMonthlyExpenses: Record<string, number> = { ...monthlyExpenses };
  if (workingOverride?.base_monthlies) {
    Object.entries(workingOverride.base_monthlies).forEach(([key, value]) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        mergedMonthlyExpenses[key] = value;
      }
    });
  }
  const debtMonthly = typeof metrics?.debt_service_annual === 'number' ? metrics.debt_service_annual / 12 : null;
  const monthlyExpenseLines: Array<{ label: string; value: number | null | undefined; editConfig?: ValueEditorState }> = [
    {
      label: 'Property taxes',
      value: taxesMonthly,
      editConfig: {
        label: 'Property taxes (monthly)',
        path: 'taxes_annual_fixed',
        type: 'monthlyToAnnual' as ValueEditorType,
        value: taxesMonthly ?? null,
      },
    },
    {
      label: 'Insurance',
      value: insuranceMonthly,
      editConfig: {
        label: 'Insurance (monthly)',
        path: 'insurance_rate_of_value',
        type: 'ratioOfPrice' as ValueEditorType,
        value:
          workingOverride?.insurance_rate_of_value && listingPrice
            ? (workingOverride.insurance_rate_of_value * listingPrice) / 12
            : insuranceMonthly ?? null,
      },
    },
    {
      label: 'Management fee',
      value: mgmtFee,
      editConfig: {
        label: 'Management fee (%)',
        path: 'mgmt_fee_pct_of_egi',
        type: 'percent' as ValueEditorType,
        value:
          typeof inputs?.mgmt_fee_pct_of_egi === 'number'
            ? inputs.mgmt_fee_pct_of_egi * 100
            : (workingOverride?.mgmt_fee_pct_of_egi ?? baselineAssumptions.mgmt_fee_pct_of_egi ?? 0) * 100,
      },
    },
    ...Object.entries(mergedMonthlyExpenses).map(([key, value]) => ({
      label: titleCase(key),
      value,
      editConfig: {
        label: `${titleCase(key)} (monthly)`,
        path: `base_monthlies.${key}`,
        type: 'currency' as ValueEditorType,
        value: typeof value === 'number' ? value : null,
      },
    })),
  ];
  const totalOperatingExpensesMonthly = monthlyExpenseLines.reduce(
    (sum, item) => sum + (typeof item.value === 'number' ? item.value : 0),
    0
  );
  const downPaymentPct =
    (typeof inputs?.down_payment_pct === 'number' ? inputs.down_payment_pct : null) ??
    (workingOverride?.down_payment_pct ?? baselineAssumptions.down_payment_pct ?? DEFAULT_DPCT);
  const downPaymentAmount = listingPrice != null && typeof downPaymentPct === 'number' ? listingPrice * downPaymentPct : null;
  const inferredClosingPct =
    listingPrice && typeof inputs?.closing_costs === 'number' && listingPrice > 0
      ? (inputs.closing_costs as number) / listingPrice
      : null;
  const closingCostsPct =
    typeof inputs?.closing_costs_pct_used === 'number'
      ? inputs.closing_costs_pct_used
      : inferredClosingPct ??
        (typeof workingOverride?.closing_costs_pct === 'number'
          ? workingOverride.closing_costs_pct
          : baselineAssumptions.closing_costs_pct ?? null);
  const closingCostsAmount =
    typeof inputs?.closing_costs === 'number'
      ? inputs.closing_costs
      : listingPrice && typeof closingCostsPct === 'number'
        ? listingPrice * closingCostsPct
        : null;
  const initialRepairsBreakdown = (inputs?.initial_repairs_breakdown as {
    base_initial_repairs?: number;
    renovation_cost_estimate?: number;
    total_initial_repairs?: number;
  }) ?? undefined;
  const baseInitialRepairs =
    typeof initialRepairsBreakdown?.base_initial_repairs === 'number'
      ? initialRepairsBreakdown.base_initial_repairs
      : workingOverride?.initial_repairs ?? baselineAssumptions.initial_repairs ?? 0;
  const renovationEstimate =
    typeof initialRepairsBreakdown?.renovation_cost_estimate === 'number'
      ? initialRepairsBreakdown.renovation_cost_estimate
      : workingOverride?.renovation_cost_estimate ?? baselineAssumptions.renovation_cost_estimate ?? 0;
  const initialRepairs =
    typeof initialRepairsBreakdown?.total_initial_repairs === 'number'
      ? initialRepairsBreakdown.total_initial_repairs
      : typeof inputs?.initial_repairs === 'number'
        ? inputs.initial_repairs
        : baseInitialRepairs + renovationEstimate;
  const totalCashIn =
    typeof metrics?.cash_invested === 'number'
      ? metrics.cash_invested
      : (downPaymentAmount ?? 0) + (closingCostsAmount ?? 0) + (initialRepairs ?? 0);

  const zpid = listing?.zpid ?? row?.zpid;
  const canEditOverrides = Boolean(zpid && onPropertyOverrideChange);
  const displayPrice = listing?.price ?? row?.price ?? null;
  const summaryChips: Array<{ key: string; label: string; variant?: 'filled' | 'outlined' }> = [];
  if (typeof displayPrice === 'number') {
    summaryChips.push({
      key: 'price',
      label: `$${displayPrice.toLocaleString()}`,
      variant: 'filled',
    });
  }
  if (listing?.bedrooms != null || listing?.bathrooms != null) {
    summaryChips.push({
      key: 'beds-baths',
      label: `${listing?.bedrooms ?? '—'} bd / ${listing?.bathrooms ?? '—'} ba`,
    });
  }
  if (listing?.livingArea != null) {
    summaryChips.push({
      key: 'area',
      label: `${listing.livingArea.toLocaleString()} sqft`,
    });
  }
  if (listing?.zpid) {
    summaryChips.push({
      key: 'zpid',
      label: `ZPID ${listing.zpid}`,
    });
  }

  const appendCalcToken = useCallback(
    (token: string) => {
      setCalcExpression((prev) => `${prev}${token}`);
      setCalcError(null);
    },
    [setCalcExpression]
  );

  const clearCalculator = useCallback(() => {
    setCalcExpression('');
    setCalcResult('');
    setCalcError(null);
  }, []);

  const backspaceCalculator = useCallback(() => {
    setCalcExpression((prev) => prev.slice(0, -1));
    setCalcError(null);
  }, []);

  const openValueEditor = (config: ValueEditorState) => {
    if (!canEditOverrides) return;
    setValueEditor(config);
    setValueDraft(config.value != null ? String(config.value) : '');
    setValueError(null);
  };

  const closeValueEditor = () => {
    setValueEditor(null);
    setValueDraft('');
    setValueError(null);
  };

  const applyOverrideValue = (path: string, nextValue: number | null) => {
    if (!canEditOverrides) return;
    setOverrideDraft((prev) => {
      const base: any = prev ? JSON.parse(JSON.stringify(prev)) : {};
      const parts = path.split('.');
      let target = base;
      for (let i = 0; i < parts.length - 1; i += 1) {
        const key = parts[i];
        const current = target[key];
        if (typeof current !== 'object' || current === null) {
          target[key] = {};
        }
        target[key] = { ...target[key] };
        target = target[key];
      }
      const finalKey = parts[parts.length - 1];
      if (nextValue == null || Number.isNaN(nextValue)) {
        delete target[finalKey];
      } else {
        target[finalKey] = nextValue;
      }
      const prune = (obj: any) => {
        Object.keys(obj).forEach((key) => {
          const value = obj[key];
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            prune(value);
            if (Object.keys(value).length === 0) {
              delete obj[key];
            }
          } else if (value === undefined) {
            delete obj[key];
          }
        });
      };
      prune(base);
      const cleaned = Object.keys(base).length ? base : null;
      setHasPendingChanges(serializeOverride(cleaned) !== baselineSerialized);
      return cleaned;
    });
  };

  const handleValueEditorSave = () => {
    if (!valueEditor) return;
    const trimmed = valueDraft.trim();
    const numericValue = trimmed === '' ? null : Number(trimmed);
    if (numericValue !== null && Number.isNaN(numericValue)) {
      setValueError('Enter a valid number or leave blank to reset.');
      return;
    }
    let payloadValue: number | null = numericValue;
    if (payloadValue !== null) {
      switch (valueEditor.type) {
        case 'percent':
          payloadValue = payloadValue / 100;
          break;
        case 'monthlyToAnnual':
          payloadValue = payloadValue * 12;
          break;
        case 'ratioOfPrice':
          {
            const priceBasis = listingPrice ?? inputs?.purchase_price ?? null;
            payloadValue =
              priceBasis && priceBasis > 0 ? (payloadValue * 12) / priceBasis : payloadValue;
          }
          break;
        default:
          break;
      }
    }
    applyOverrideValue(valueEditor.path, payloadValue);
    closeValueEditor();
  };

  const evaluateExpression = useCallback(() => {
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function(`"use strict"; return (${calcExpression});`);
      const result = fn();
      setCalcResult(String(result));
      setCalcError(null);
    } catch (error: any) {
      setCalcError(error?.message ?? 'Unable to evaluate expression.');
      setCalcResult('');
    }
  }, [calcExpression]);

  const handleOverrideReset = () => {
    if (!canEditOverrides) return;
    const cloned = cloneOverride(propertyOverride);
    setOverrideDraft(cloned);
    setHasPendingChanges(false);
  };

  const handleOverrideSave = () => {
    if (!canEditOverrides || !onPropertyOverrideChange) return;
    onPropertyOverrideChange(overrideDraft);
    const serialized = serializeOverride(overrideDraft);
    setBaselineSerialized(serialized);
    setHasPendingChanges(false);
  };

  useEffect(() => {
    const cloned = cloneOverride(propertyOverride);
    setOverrideDraft(cloned);
    setBaselineSerialized(serializeOverride(cloned));
    setHasPendingChanges(false);
  }, [propertyOverride, open]);

  useEffect(() => {
    if (!showCalculator) {
      return undefined;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        evaluateExpression();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowCalculator(false);
        return;
      }
      if (event.key === 'Backspace') {
        event.preventDefault();
        backspaceCalculator();
        return;
      }
      if (event.key === 'Delete') {
        event.preventDefault();
        clearCalculator();
        return;
      }
      if (/^[0-9]$/.test(event.key) || ['+', '-', '*', '/', '.', '(', ')'].includes(event.key)) {
        event.preventDefault();
        appendCalcToken(event.key);
      }
      if (event.key === '^') {
        event.preventDefault();
        appendCalcToken('**');
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showCalculator, appendCalcToken, backspaceCalculator, clearCalculator, evaluateExpression]);

  const renderEditableValue = (display: string, config?: ValueEditorState) => (
    <Typography
      variant="body2"
      fontWeight={600}
      sx={
        canEditOverrides && config
          ? {
              cursor: 'pointer',
              color: 'primary.main',
              textDecoration: 'underline dotted',
              textUnderlineOffset: 3,
            }
          : undefined
      }
      onClick={() => config && openValueEditor(config)}
    >
      {display}
    </Typography>
  );

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
        <DialogTitle
          sx={{
            pb: 2,
            bgcolor: 'grey.50',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Stack spacing={1.25}>
            <Stack direction="row" alignItems="flex-start" spacing={1.5}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="h6" component="div">
                  Property Detail
                </Typography>
                <Typography variant="body2" color="text.secondary" noWrap>
                  {listing?.address ?? row?.address ?? 'Address unavailable'}
                </Typography>
              </Box>
              <IconButton onClick={onClose} aria-label="Close detail drawer">
                <CloseIcon />
              </IconButton>
            </Stack>
            {summaryChips.length ? (
              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 1 }}>
                {summaryChips.map((chip) => (
                  <Chip
                    key={chip.key}
                    label={chip.label}
                    color={chip.key === 'price' ? 'primary' : 'default'}
                    variant={chip.variant ?? 'outlined'}
                    size="small"
                    sx={{ fontWeight: chip.key === 'price' ? 600 : 400 }}
                  />
                ))}
              </Stack>
            ) : null}
            <Button
              variant="outlined"
              size="small"
              startIcon={<CalculateIcon />}
              onClick={() => {
                setCalcExpression('');
                setCalcResult('');
                setCalcError(null);
                setShowCalculator(true);
              }}
              sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }}
            >
              Open calculator
            </Button>
          </Stack>
        </DialogTitle>
        <DialogContent dividers sx={{ maxHeight: '80vh' }}>
          <Stack spacing={2}>
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
                    {renderEditableValue(formatCurrency(displayGsrMonthly), {
                      label: 'Gross scheduled rent',
                      path: 'monthly_rent_override',
                      type: 'currency',
                      value: displayGsrMonthly ?? null,
                    })}
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2">Vacancy ({(displayVacancyRate * 100).toFixed(1)}%)</Typography>
                    {renderEditableValue(
                      vacancyLoss != null ? `-${formatCurrency(vacancyLoss).replace('$', '')}` : '—',
                      {
                        label: 'Vacancy rate (%)',
                        path: 'vacancy_rate_pct',
                        type: 'percent',
                        value: displayVacancyRate * 100,
                      }
                    )}
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2">Other income</Typography>
                    {renderEditableValue(formatCurrency(displayOtherIncome))}
                  </Stack>
                  <Divider flexItem sx={{ my: 0.5 }} />
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" fontWeight={600}>
                      Effective gross income
                    </Typography>
                    <Typography variant="body2" fontWeight={700}>
                      {formatCurrency(displayEgiMonthly)}
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
                    {renderEditableValue(formatCurrency(item.value), item.editConfig)}
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
                </Stack>
              </Box>
            </Box>
          ) : null}
          <Box>
            <Typography variant="subtitle1">Upfront Costs</Typography>
            <Stack spacing={0.5} sx={{ mt: 0.5 }}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2">Down payment</Typography>
                {renderEditableValue(
                  formatCurrency(downPaymentAmount, {
                    suffix: downPaymentPct ? ` (${(downPaymentPct * 100).toFixed(1)}%)` : '',
                  }),
                  {
                    label: 'Down payment (%)',
                    path: 'down_payment_pct',
                    type: 'percent',
                    value: typeof downPaymentPct === 'number' ? downPaymentPct * 100 : null,
                  }
                )}
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2">Closing costs</Typography>
                {renderEditableValue(
                  formatCurrency(closingCostsAmount, {
                    suffix: closingCostsPct ? ` (${(closingCostsPct * 100).toFixed(1)}%)` : '',
                  }),
                  {
                    label: 'Closing costs (%)',
                    path: 'closing_costs_pct',
                    type: 'percent',
                    value: closingCostsPct ? closingCostsPct * 100 : null,
                    helper: 'Enter percent of purchase price (e.g. 3 for 3%).',
                  }
                )}
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2">Initial repairs</Typography>
                {renderEditableValue(formatCurrency(initialRepairs), {
                  label: 'Initial repairs (total)',
                  path: 'initial_repairs',
                  type: 'currency',
                  value: initialRepairs ?? null,
                })}
              </Stack>
              {baseInitialRepairs ? (
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">
                    • Base repairs
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatCurrency(baseInitialRepairs)}
                  </Typography>
                </Stack>
              ) : null}
              {renovationEstimate ? (
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">
                    • Renovation estimate
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatCurrency(renovationEstimate)}
                  </Typography>
                </Stack>
              ) : null}
              <Divider flexItem sx={{ my: 0.5 }} />
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" fontWeight={600}>
                Total cash in
              </Typography>
              <Typography variant="body2" fontWeight={700}>
                {formatCurrency(totalCashIn)}
              </Typography>
            </Stack>
          </Stack>
        </Box>
          {canEditOverrides ? (
            <Box>
              <Divider flexItem sx={{ my: 2 }} />
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                justifyContent="space-between"
              >
                <Typography variant="body2" color="text.secondary">
                  Save changes to re-run the pipeline with these overrides.
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button variant="text" onClick={handleOverrideReset} disabled={!hasPendingChanges}>
                    Reset
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleOverrideSave}
                    disabled={!hasPendingChanges}
                  >
                    Save &amp; Re-run
                  </Button>
                </Stack>
              </Stack>
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
      <Dialog open={Boolean(valueEditor)} onClose={closeValueEditor} maxWidth="xs" fullWidth>
        <DialogTitle>{valueEditor?.label ?? 'Adjust value'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <TextField
              autoFocus
              type="number"
              inputMode="decimal"
              label={
                valueEditor?.type === 'percent'
                  ? 'Percentage'
                  : valueEditor?.type === 'number'
                    ? 'Value'
                    : 'Amount'
              }
              value={valueDraft}
              onChange={(event) => setValueDraft(event.target.value)}
              helperText={valueError ?? valueEditor?.helper ?? 'Leave blank to reset to defaults.'}
              error={Boolean(valueError)}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeValueEditor}>Cancel</Button>
          <Button onClick={handleValueEditorSave} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={showCalculator}
        onClose={() => setShowCalculator(false)}
        maxWidth="xs"
        fullWidth
        hideBackdrop
        disableRestoreFocus
        disableEnforceFocus
        disableAutoFocus
      >
        <DialogTitle>Quick calculator</DialogTitle>
        <DialogContent>
          <CalcPad
            expression={calcExpression}
            result={calcResult}
            onAppend={appendCalcToken}
            onClear={clearCalculator}
            onBackspace={backspaceCalculator}
            onEvaluate={evaluateExpression}
          />
          {calcError ? (
            <Typography variant="body2" color="error" sx={{ mt: 1 }}>
              {calcError}
            </Typography>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCalculator(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default DetailDrawer;
