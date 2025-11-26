import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AppBar,
  Box,
  Button,
  Chip,
  Container,
  Stack,
  Toolbar,
  Typography,
  Paper,
  IconButton,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import MenuIcon from '@mui/icons-material/Menu';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import SettingsSuggestIcon from '@mui/icons-material/SettingsSuggest';
import { useSnackbar } from 'notistack';
import SearchForm from './components/SearchForm';
import PropertyResults from './components/PropertyResults';
import PipelineResultsTable from './components/PipelineResultsTable';
import SearchHistory from './components/SearchHistory';
import PipelineHistory from './components/PipelineHistory';
import type { ResultFilters } from './components/PropertyResults';
import SidebarLayout from './components/SidebarLayout';
import DetailDrawer from './components/DetailDrawer';
import PipelineControlsDialog from './components/PipelineControlsDialog';
import ResultsTabs from './components/ResultsTabs';
import type {
  AssumptionOverrides,
  FinalAnalysisResponse,
  PipelineOptions,
  PipelineRow,
  PropertyListing,
  PropertySearchPayload,
  UnderwriteOutput,
} from './api/types';
import {
  useAgentRun,
  useFinalAnalysis,
  useHistorySearch,
  usePipelineHistory,
  usePipelineHistoryEntry,
  usePipelineRun,
  useSearchHistory,
  useSearchProperties,
} from './api/hooks';
import './App.css';

const defaultSearchValues: PropertySearchPayload = {
  location: 'CT',
  status_type: 'ForSale',
  home_type: 'Multi-family',
  max_price: 300000,
  limit: 25,
};

const defaultAssumptionOverrides: AssumptionOverrides = {
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
  base_monthlies: {
    repairs_maintenance: 150,
    capex_reserve: 150,
    electric_common: 50,
    water_sewer: 0,
    trash: 0,
  },
};

const cloneAssumptions = (input: AssumptionOverrides): AssumptionOverrides => ({
  ...input,
  base_monthlies: input.base_monthlies ? { ...input.base_monthlies } : input.base_monthlies,
});

const buildDefaultPipelineOptions = (): PipelineOptions => ({
  fetch_details_for_promising: true,
  max_detail_fetches: 15,
  detail_sleep_sec: 0.4,
  use_agent_for_final: false,
  assumption_overrides: cloneAssumptions(defaultAssumptionOverrides),
});

const defaultResultFilters: ResultFilters = {
  query: '',
  minBeds: null,
  maxPrice: null,
};

function App() {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [searchResults, setSearchResults] = useState<PropertyListing[]>([]);
  const [lastSearchId, setLastSearchId] = useState<number | null>(null);
  const [selectedZpids, setSelectedZpids] = useState<Set<string>>(new Set());
  const [pipelineOptions, setPipelineOptions] = useState<PipelineOptions>(() => buildDefaultPipelineOptions());
  const [pipelineResults, setPipelineResults] = useState<PipelineRow[]>([]);
  const [pipelineLabel, setPipelineLabel] = useState('');
  const [drawerZpid, setDrawerZpid] = useState<string | null>(null);
  const [detailMap, setDetailMap] = useState<Record<string, FinalAnalysisResponse>>({});
  const [agentMap, setAgentMap] = useState<Record<string, UnderwriteOutput>>({});
  const [propertyOverrides, setPropertyOverrides] = useState<Record<string, AssumptionOverrides>>({});
  const [agentLoadingId, setAgentLoadingId] = useState<string | null>(null);
  const [finalizingId, setFinalizingId] = useState<string | null>(null);
  const [resultFilters, setResultFilters] = useState<ResultFilters>(defaultResultFilters);
  const [forceAgentRun, setForceAgentRun] = useState(false);
  const [forceFinalRun, setForceFinalRun] = useState(false);
  const [resultsTab, setResultsTab] = useState<'search' | 'pipeline'>('search');
  const [pipelineControlsOpen, setPipelineControlsOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(true);

  const listingsByZpid = useMemo(() => {
    const map: Record<string, PropertyListing> = {};
    searchResults.forEach((listing) => {
      map[String(listing.zpid)] = listing;
    });
    return map;
  }, [searchResults]);

  const searchMutation = useSearchProperties();
  const pipelineMutation = usePipelineRun();
  const propertyOverrideMutation = usePipelineRun();
  const agentMutation = useAgentRun();
  const finalMutation = useFinalAnalysis();
  const historyQuery = useSearchHistory();
  const historyMutation = useHistorySearch();
  const [historyLoadingId, setHistoryLoadingId] = useState<number | null>(null);
  const pipelineHistoryQuery = usePipelineHistory();
  const pipelineHistoryMutation = usePipelineHistoryEntry();
  const [pipelineHistoryLoadingId, setPipelineHistoryLoadingId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const assumptionOverrides = pipelineOptions.assumption_overrides ?? cloneAssumptions(defaultAssumptionOverrides);
  const defaultDownPaymentPct = assumptionOverrides.down_payment_pct ?? defaultAssumptionOverrides.down_payment_pct ?? 0.25;
  const overrideTimersRef = useRef<Record<string, number>>({});
  const latestDataRef = useRef({
    pipelineResults,
    pipelineOptions,
    listingsByZpid,
    lastSearchId,
    propertyOverrides,
  });
  const getDownPaymentPct = useCallback(
    (zpid: string) => {
      const override = propertyOverrides[zpid]?.down_payment_pct;
      if (typeof override === 'number' && !Number.isNaN(override)) {
        return override;
      }
      return defaultDownPaymentPct;
    },
    [propertyOverrides, defaultDownPaymentPct]
  );

  const handleAssumptionOverridesChange = (next: AssumptionOverrides) => {
    setPipelineOptions((prev) => ({
      ...prev,
      assumption_overrides: {
        ...next,
        base_monthlies: next.base_monthlies ? { ...next.base_monthlies } : next.base_monthlies,
      },
    }));
  };

  const handleResetAssumptions = () => {
    setPipelineOptions((prev) => ({
      ...prev,
      assumption_overrides: cloneAssumptions(defaultAssumptionOverrides),
    }));
  };

  const sanitizePropertyOverride = (input: AssumptionOverrides | null): AssumptionOverrides | null => {
    if (!input) {
      return null;
    }
    const cleaned: AssumptionOverrides = {};
    if (input.monthly_rent_override != null && !Number.isNaN(input.monthly_rent_override)) {
      cleaned.monthly_rent_override = input.monthly_rent_override;
    }
    if (input.down_payment_pct != null && !Number.isNaN(input.down_payment_pct)) {
      cleaned.down_payment_pct = input.down_payment_pct;
    }
    if (input.base_monthlies) {
      const base: Record<string, number> = {};
      Object.entries(input.base_monthlies).forEach(([key, value]) => {
        if (typeof value === 'number' && !Number.isNaN(value)) {
          base[key] = value;
        }
      });
      if (Object.keys(base).length) {
        cleaned.base_monthlies = base;
      }
    }
    return Object.keys(cleaned).length ? cleaned : null;
  };

  const recomputePipelineEntry = (zpid: string, overrideOverride?: AssumptionOverrides | null) => {
    const {
      listingsByZpid: currentListings,
      pipelineResults: currentPipelineResults,
      pipelineOptions: currentPipelineOptions,
      lastSearchId: currentSearchId,
      propertyOverrides: currentOverrides,
    } = latestDataRef.current;
    const listing = currentListings[zpid];
    if (!listing) {
      return;
    }
    if (!currentPipelineResults.some((row) => row.zpid === zpid)) {
      return;
    }
    const activeOverride =
      typeof overrideOverride !== 'undefined' ? overrideOverride : currentOverrides[zpid] ?? null;
    const listingOverridePayload = activeOverride
      ? {
          [zpid]: activeOverride,
        }
      : undefined;
    const singleRunOptions: PipelineOptions = {
      ...currentPipelineOptions,
      fetch_details_for_promising: false,
      max_detail_fetches: 0,
    };
    propertyOverrideMutation.mutate(
      {
        listings: [listing],
        options: singleRunOptions,
        search_id: currentSearchId,
        listing_overrides: listingOverridePayload,
        skip_history: true,
      },
      {
        onSuccess: (data) => {
          const updatedRow = data.results[0];
          if (!updatedRow) {
            enqueueSnackbar('Override update succeeded but returned no data.', { variant: 'warning' });
            return;
          }
          let clearedFinal = false;
          let touched = false;
          setPipelineResults((prev) => {
            const mapped = prev.map((row) => {
              if (row.zpid !== zpid) {
                return row;
              }
              touched = true;
              if (row.detail_fetched) {
                clearedFinal = true;
                return {
                  ...row,
                  stage: updatedRow.stage ?? 'coarse',
                  coarse_metrics: updatedRow.coarse_metrics ?? row.coarse_metrics,
                  coarse_inputs: updatedRow.coarse_inputs ?? row.coarse_inputs,
                  final_metrics: null,
                  final_inputs: null,
                  detail_fetched: false,
                  detail_error: undefined,
                };
              }
              return {
                ...row,
                ...updatedRow,
                idx: row.idx,
              };
            });
            if (!touched) {
              return prev;
            }
            const sorted = [...mapped];
            sorted.sort((a, b) => {
              const metricsA = (a.final_metrics ?? a.coarse_metrics) as Record<string, number> | undefined;
              const metricsB = (b.final_metrics ?? b.coarse_metrics) as Record<string, number> | undefined;
              const dscrA = metricsA?.dscr ?? 0;
              const dscrB = metricsB?.dscr ?? 0;
              if (dscrA === dscrB) {
                const cocA = metricsA?.cash_on_cash ?? 0;
                const cocB = metricsB?.cash_on_cash ?? 0;
                return cocB - cocA;
              }
              return dscrB - dscrA;
            });
            return sorted;
          });
          if (!touched) {
            return;
          }
          if (clearedFinal) {
            setDetailMap((prev) => {
              if (!prev[zpid]) {
                return prev;
              }
              const next = { ...prev };
              delete next[zpid];
              return next;
            });
          }
          setAgentMap((prev) => {
            if (!prev[zpid]) {
              return prev;
            }
            const next = { ...prev };
            delete next[zpid];
            return next;
          });
          enqueueSnackbar(
            clearedFinal
              ? 'Overrides applied. Final detail cleared—run Finalize again for refreshed metrics.'
              : 'Overrides applied to pipeline entry.',
            { variant: 'info' }
          );
        },
        onError: (error) => enqueueSnackbar(error.message, { variant: 'error' }),
      }
    );
  };

  const handlePropertyOverrideChange = (zpid: string, next: AssumptionOverrides | null) => {
    const sanitized = sanitizePropertyOverride(next);
    setPropertyOverrides((prev) => {
      if (!sanitized) {
        if (!prev[zpid]) {
          return prev;
        }
        const updated = { ...prev };
        delete updated[zpid];
        return updated;
      }
      return {
        ...prev,
        [zpid]: {
          ...sanitized,
          base_monthlies: sanitized.base_monthlies ? { ...sanitized.base_monthlies } : sanitized.base_monthlies,
        },
      };
    });
    if (!pipelineResults.some((row) => row.zpid === zpid)) {
      enqueueSnackbar('Override saved. Run the pipeline to see updated metrics.', { variant: 'info' });
      return;
    }
    const timerId = overrideTimersRef.current[zpid];
    if (timerId) {
      window.clearTimeout(timerId);
    }
    overrideTimersRef.current[zpid] = window.setTimeout(() => {
      delete overrideTimersRef.current[zpid];
      recomputePipelineEntry(zpid);
    }, 600);
  };
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const toolbarHeight = isDesktop ? 64 : 56;

  useEffect(() => {
    return () => {
      Object.values(overrideTimersRef.current).forEach((timerId) => {
        window.clearTimeout(timerId);
      });
    };
  }, []);

  useEffect(() => {
    latestDataRef.current = {
      pipelineResults,
      pipelineOptions,
      listingsByZpid,
      lastSearchId,
      propertyOverrides,
    };
  }, [pipelineResults, pipelineOptions, listingsByZpid, lastSearchId, propertyOverrides]);

  const handleSearch = (values: PropertySearchPayload) => {
    searchMutation.mutate(values, {
      onSuccess: (data) => {
        const normalized = (data.props ?? [])
          .filter((item) => item.zpid ?? (item as any).zpidId)
          .map((item) => ({
            ...item,
            zpid: String(item.zpid ?? (item as any).zpidId ?? crypto.randomUUID()),
          }));
        setSearchResults(normalized);
        setSelectedZpids(new Set(normalized.map((item) => String(item.zpid))));
        setLastSearchId(data.search_id ?? null);
        setResultFilters({ ...defaultResultFilters });
        setPipelineResults([]);
        setPropertyOverrides({});
        setResultsTab('search');
        setSearchDialogOpen(false);
        enqueueSnackbar(`Loaded ${normalized.length} listings`, { variant: 'success' });
        queryClient.invalidateQueries({ queryKey: ['search-history'] }).catch(() => {});
      },
      onError: (error) => enqueueSnackbar(error.message, { variant: 'error' }),
    });
  };

  const handleToggleSelection = (zpid: string) => {
    setSelectedZpids((prev) => {
      const next = new Set(prev);
      if (next.has(zpid)) {
        next.delete(zpid);
      } else {
        next.add(zpid);
      }
      return next;
    });
  };

  const handleRunPipeline = () => {
    const targetListings = (selectedZpids.size ? Array.from(selectedZpids) : searchResults.map((item) => String(item.zpid)))
      .map((zpid) => listingsByZpid[zpid])
      .filter(Boolean) as PropertyListing[];

    if (targetListings.length === 0) {
      enqueueSnackbar('Select at least one property to run the pipeline.', { variant: 'warning' });
      return;
    }

    const overridesPayload = targetListings.reduce<Record<string, AssumptionOverrides>>((acc, listing) => {
      const key = String(listing.zpid);
      const override = propertyOverrides[key];
      if (override) {
        acc[key] = override;
      }
      return acc;
    }, {});
    const listingOverrides = Object.keys(overridesPayload).length ? overridesPayload : undefined;

    pipelineMutation.mutate(
      {
        listings: targetListings,
        options: pipelineOptions,
        search_id: lastSearchId,
        label: pipelineLabel || undefined,
        listing_overrides: listingOverrides,
      },
      {
        onSuccess: (data) => {
          setPipelineResults(data.results);
          setResultsTab('pipeline');
          enqueueSnackbar('Pipeline completed', { variant: 'success' });
          queryClient.invalidateQueries({ queryKey: ['pipeline-history'] }).catch(() => {});
        },
        onError: (error) => enqueueSnackbar(error.message, { variant: 'error' }),
      }
    );
  };

  const handleRunAgent = (row: PipelineRow) => {
    const payload = row.final_inputs ?? row.coarse_inputs;
    if (!payload) {
      enqueueSnackbar('No inputs available for this row yet.', { variant: 'warning' });
      return;
    }
    setAgentLoadingId(row.zpid);
    agentMutation.mutate(
      { zpid: row.zpid, listing_payload: { analyze_multifamily: payload }, force: forceAgentRun },
      {
        onSuccess: (data) => {
          setAgentMap((prev) => ({ ...prev, [row.zpid]: data }));
          enqueueSnackbar('Agent run completed', { variant: 'success' });
        },
        onError: (error) => enqueueSnackbar(error.message, { variant: 'error' }),
        onSettled: () => setAgentLoadingId(null),
      }
    );
  };

  const handleFinalize = (row: PipelineRow) => {
    const listing = listingsByZpid[row.zpid];
    if (!listing) {
      enqueueSnackbar('Unable to find original listing data for this property.', { variant: 'error' });
      return;
    }
    setFinalizingId(row.zpid);
    finalMutation.mutate(
      {
        zpid: row.zpid,
        listing,
        use_agent: pipelineOptions.use_agent_for_final,
        force: forceFinalRun,
        assumption_overrides: pipelineOptions.assumption_overrides,
        listing_override: propertyOverrides[row.zpid],
      },
      {
        onSuccess: (data) => {
          setDetailMap((prev) => ({ ...prev, [row.zpid]: data }));
          if (data.agent_output) {
            setAgentMap((prev) => ({ ...prev, [row.zpid]: data.agent_output! }));
          }
          setPipelineResults((prev) =>
            prev.map((item) =>
              item.zpid === row.zpid
                ? {
                    ...item,
                    stage: 'final',
                    final_metrics: data.metrics,
                    final_inputs: data.final_inputs,
                    detail_fetched: true,
                  }
                : item
            )
          );
          enqueueSnackbar('Final detail retrieved', { variant: 'success' });
        },
        onError: (error) => enqueueSnackbar(error.message, { variant: 'error' }),
        onSettled: () => setFinalizingId(null),
      }
    );
  };

  const handleSelectAll = () => setSelectedZpids(new Set(searchResults.map((listing) => String(listing.zpid))));
  const handleClearSelection = () => setSelectedZpids(new Set());
  const handleClearResults = () => {
    setSearchResults([]);
    setSelectedZpids(new Set());
    setLastSearchId(null);
    setPipelineResults([]);
    setResultFilters({ ...defaultResultFilters });
    setPropertyOverrides({});
    setResultsTab('search');
  };

  const handleLoadHistory = (searchId: number) => {
    setHistoryLoadingId(searchId);
    historyMutation.mutate(searchId, {
      onSuccess: (data) => {
        const normalized = (data.props ?? []).map((item) => ({
          ...item,
          zpid: String(item.zpid ?? (item as any).zpidId ?? crypto.randomUUID()),
        }));
        setSearchResults(normalized);
        setSelectedZpids(new Set(normalized.map((item) => String(item.zpid))));
        setLastSearchId(data.search_id ?? null);
        setResultFilters({ ...defaultResultFilters });
        setPipelineResults([]);
        setPropertyOverrides({});
        setResultsTab('search');
        setSearchDialogOpen(false);
        enqueueSnackbar(`Loaded ${normalized.length} listings from history`, { variant: 'info' });
      },
      onError: (error) => enqueueSnackbar(error.message, { variant: 'error' }),
      onSettled: () => setHistoryLoadingId(null),
    });
  };

  const drawerListing = drawerZpid ? listingsByZpid[drawerZpid] : undefined;
  const drawerRow = drawerZpid ? pipelineResults.find((row) => row.zpid === drawerZpid) : undefined;
  const drawerAgent = drawerZpid ? agentMap[drawerZpid] : undefined;
  const drawerDetail = drawerZpid ? detailMap[drawerZpid] : undefined;
  const drawerOverride = drawerZpid ? propertyOverrides[drawerZpid] : undefined;
  const filteredResults = useMemo(() => {
    return searchResults.filter((listing) => {
      if (resultFilters.query) {
        const address = listing.address ?? '';
        if (!address.toLowerCase().includes(resultFilters.query.toLowerCase())) {
          return false;
        }
      }
      if (typeof resultFilters.minBeds === 'number' && listing.bedrooms != null) {
        if (listing.bedrooms < resultFilters.minBeds) {
          return false;
        }
      } else if (typeof resultFilters.minBeds === 'number' && listing.bedrooms == null) {
        return false;
      }
      if (typeof resultFilters.maxPrice === 'number' && listing.price != null) {
        if (listing.price > resultFilters.maxPrice) {
          return false;
        }
      } else if (typeof resultFilters.maxPrice === 'number' && listing.price == null) {
        return false;
      }
      return true;
    });
  }, [searchResults, resultFilters]);
  const heroStats = [
    { label: 'Active listings', value: filteredResults.length, helper: 'After applying quick filters' },
    { label: 'Selected deals', value: selectedZpids.size, helper: 'Ready for the pipeline' },
    { label: 'Pipeline entries', value: pipelineResults.length, helper: 'With performance metrics' },
  ];

  const handleLoadPipelineHistory = (runId: number) => {
    setPipelineHistoryLoadingId(runId);
    const selectedEntry = pipelineHistoryQuery.data?.history.find((entry) => entry.id === runId);
    if (selectedEntry) {
      setPipelineLabel(selectedEntry.label ?? '');
      if (selectedEntry.search_id) {
        setLastSearchId(selectedEntry.search_id);
        handleLoadHistory(selectedEntry.search_id);
      }
      if (selectedEntry.options) {
        const entryOptions = selectedEntry.options as Partial<PipelineOptions> & Record<string, unknown>;
        const parseNumber = (value: unknown) => {
          if (typeof value === 'number') return value;
          if (typeof value === 'string') {
            const parsed = Number(value);
            return Number.isNaN(parsed) ? undefined : parsed;
          }
          return undefined;
        };
        setPipelineOptions((prev) => ({
          ...prev,
          fetch_details_for_promising:
            typeof entryOptions.fetch_details_for_promising === 'boolean'
              ? entryOptions.fetch_details_for_promising
              : prev.fetch_details_for_promising,
          max_detail_fetches: parseNumber(entryOptions.max_detail_fetches) ?? prev.max_detail_fetches,
          detail_sleep_sec: parseNumber(entryOptions.detail_sleep_sec) ?? prev.detail_sleep_sec,
          use_agent_for_final:
            typeof entryOptions.use_agent_for_final === 'boolean'
              ? entryOptions.use_agent_for_final
              : prev.use_agent_for_final,
          assumption_overrides: entryOptions.assumption_overrides
            ? {
                ...cloneAssumptions(defaultAssumptionOverrides),
                ...(entryOptions.assumption_overrides as AssumptionOverrides),
              }
            : prev.assumption_overrides,
        }));
      }
    }
    pipelineHistoryMutation.mutate(runId, {
      onSuccess: (data) => {
        setPipelineResults(data.results);
        setResultsTab('pipeline');
        enqueueSnackbar('Loaded pipeline results from history', { variant: 'info' });
      },
      onError: (error) => enqueueSnackbar(error.message, { variant: 'error' }),
      onSettled: () => setPipelineHistoryLoadingId(null),
    });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', overflow: 'hidden' }}>
      <AppBar
        position="fixed"
        color="default"
        elevation={1}
        sx={{
          backgroundColor: theme.palette.background.paper,
          borderBottom: '1px solid rgba(15, 23, 42, 0.08)',
          boxShadow: '0 2px 12px rgba(15, 23, 42, 0.08)',
          borderRadius: 0,
        }}
      >
        <Toolbar sx={{ gap: 2 }}>
          <IconButton
            color="primary"
            onClick={() => setSidebarOpen((prev) => !prev)}
            edge="start"
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1.5,
              bgcolor: sidebarOpen ? 'action.hover' : 'background.paper',
            }}
          >
            {sidebarOpen ? <MenuOpenIcon /> : <MenuIcon />}
          </IconButton>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Multifamily Underwriting Workbench
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Surface qualified opportunities faster
            </Typography>
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          <Button variant="outlined" onClick={() => setSearchDialogOpen(true)}>
            New Search
          </Button>
          <Chip label="Beta access" color="secondary" size="small" />
        </Toolbar>
      </AppBar>
      <Box sx={{ flex: 1, minHeight: 0}}>
        <SidebarLayout
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((prev) => !prev)}
          topOffset={toolbarHeight}
          sidebar={
            <Stack spacing={3}
              sx={{ mt: 3}}
            >
              <SearchHistory
                entries={historyQuery.data?.history}
                isLoading={historyQuery.isLoading}
                onSelect={handleLoadHistory}
                loadingId={historyLoadingId}
              />
              <PipelineHistory
                entries={pipelineHistoryQuery.data?.history}
                isLoading={pipelineHistoryQuery.isLoading}
                onSelect={handleLoadPipelineHistory}
                loadingId={pipelineHistoryLoadingId}
              />
            </Stack>
          }
        >
          <Container maxWidth="xl" sx={{ py: 4 }}>
            <Stack spacing={3}>
              <Box
                sx={{
                  borderRadius: 4,
                  p: { xs: 3, md: 4 },
                  background: 'linear-gradient(135deg, #1d4ed8, #4338ca 55%, #9333ea)',
                  color: 'common.white',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 16,
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 3,
                    pointerEvents: 'none',
                  }}
                />
                <Stack spacing={2} sx={{ position: 'relative' }}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
                    <Box>
                      <Typography variant="overline" sx={{ letterSpacing: 2, opacity: 0.8 }}>
                        Deal desk
                      </Typography>
                      <Typography variant="h4" sx={{ fontWeight: 700 }}>
                        Underwrite markets with confidence
                      </Typography>
                      <Typography variant="body1" sx={{ opacity: 0.85, maxWidth: 640 }}>
                        Search, filter, and advance promising properties through your underwriting pipeline. Keep tabs on agent output and final diligence without leaving this workspace.
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                      <Chip label="Fast filters" color="default" sx={{ bgcolor: 'rgba(15,23,42,0.3)', color: 'common.white' }} />
                      <Chip label="Agent insights" color="default" sx={{ bgcolor: 'rgba(15,23,42,0.3)', color: 'common.white' }} />
                      <Chip label="Pipeline history" color="default" sx={{ bgcolor: 'rgba(15,23,42,0.3)', color: 'common.white' }} />
                    </Stack>
                  </Stack>
                  <Grid container spacing={2}>
                      {heroStats.map((stat) => (
                        <Grid size={{ xs: 12, sm: 4 }} key={stat.label}>
                        <Paper
                          elevation={0}
                          sx={{
                            p: 2,
                            bgcolor: 'rgba(15,23,42,0.35)',
                            color: 'common.white',
                            borderColor: 'rgba(255,255,255,0.2)',
                          }}
                        >
                          <Typography variant="caption" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                            {stat.label}
                          </Typography>
                          <Typography variant="h5" sx={{ fontWeight: 700 }}>
                            {stat.value.toLocaleString()}
                          </Typography>
                          <Typography variant="body2" sx={{ opacity: 0.85 }}>
                            {stat.helper}
                          </Typography>
                        </Paper>
                      </Grid>
                    ))}
                  </Grid>
                </Stack>
              </Box>
              <ResultsTabs
                activeTab={resultsTab}
                onTabChange={setResultsTab}
                searchCount={filteredResults.length}
                pipelineCount={pipelineResults.length}
                searchContent={
                  <PropertyResults
                    results={filteredResults}
                    totalCount={searchResults.length}
                    selected={selectedZpids}
                    filters={resultFilters}
                    onFiltersChange={setResultFilters}
                    onToggle={handleToggleSelection}
                    onSelectAll={handleSelectAll}
                    onClearSelection={handleClearSelection}
                    onClearResults={handleClearResults}
                    onRowClick={(listing) => setDrawerZpid(String(listing.zpid))}
                    getDownPaymentPct={getDownPaymentPct}
                  />
                }
                pipelineContent={
                  <Stack spacing={2}>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1}
                      alignItems={{ xs: 'stretch', sm: 'center' }}
                      justifyContent="space-between"
                    >
                      <Typography variant="body2" color="text.secondary">
                        Adjust assumptions or rerun batches as your pipeline evolves.
                      </Typography>
                      <Button
                        variant="outlined"
                        startIcon={<SettingsSuggestIcon />}
                        onClick={() => setPipelineControlsOpen(true)}
                        sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }}
                      >
                        Pipeline Controls
                      </Button>
                    </Stack>
                    <PipelineResultsTable
                      rows={pipelineResults}
                      onRunAgent={handleRunAgent}
                      onFetchFinal={handleFinalize}
                      onSelectRow={(row) => setDrawerZpid(row.zpid)}
                      agentLoadingId={agentLoadingId}
                      finalizingId={finalizingId}
                    />
                  </Stack>
                }
              />
              <PipelineControlsDialog
                open={pipelineControlsOpen}
                onClose={() => setPipelineControlsOpen(false)}
                pipelineOptions={pipelineOptions}
                updatePipelineOptions={setPipelineOptions}
                assumptionOverrides={assumptionOverrides}
                defaultAssumptions={defaultAssumptionOverrides}
                onAssumptionsChange={handleAssumptionOverridesChange}
                onResetAssumptions={handleResetAssumptions}
                pipelineLabel={pipelineLabel}
                onPipelineLabelChange={setPipelineLabel}
                forceAgentRun={forceAgentRun}
                onForceAgentRunChange={setForceAgentRun}
                forceFinalRun={forceFinalRun}
                onForceFinalRunChange={setForceFinalRun}
                onRunPipeline={handleRunPipeline}
                isRunning={pipelineMutation.isPending}
              />
              <Dialog open={searchDialogOpen} onClose={() => setSearchDialogOpen(false)} fullWidth maxWidth="md">
                <DialogTitle>Start a New Search</DialogTitle>
                <DialogContent>
                  <SearchForm
                    defaultValues={defaultSearchValues}
                    onSubmit={handleSearch}
                    isLoading={searchMutation.isPending}
                  />
                </DialogContent>
              </Dialog>
            </Stack>
          </Container>
        </SidebarLayout>
      </Box>
        <DetailDrawer
          open={Boolean(drawerZpid)}
          onClose={() => setDrawerZpid(null)}
          listing={drawerListing}
          row={drawerRow}
          agentOutput={drawerAgent}
          finalDetail={drawerDetail}
          propertyOverride={drawerOverride}
          baselineAssumptions={assumptionOverrides}
          onPropertyOverrideChange={
            drawerZpid ? (next) => handlePropertyOverrideChange(drawerZpid, next) : undefined
          }
        />
    </Box>
  );
}

export default App;
