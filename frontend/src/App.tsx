import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AppBar,
  Box,
  Button,
  Chip,
  Container,
  Dialog,
  DialogContent,
  IconButton,
  Paper,
  Stack,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import SettingsSuggestIcon from '@mui/icons-material/SettingsSuggest';
import { useSnackbar } from 'notistack';
import SearchForm from './components/SearchForm';
import PropertyResults from './components/PropertyResults';
import SearchHistory from './components/SearchHistory';
import SidebarLayout from './components/SidebarLayout';
import DetailDrawer from './components/DetailDrawer';
import PipelineControlsDialog from './components/PipelineControlsDialog';
import AgentChatDrawer from './components/AgentChatDrawer';
import type {
  AgentConversationResponse,
  AssumptionOverrides,
  FinalAnalysisResponse,
  PipelineOptions,
  PipelineRow,
  PropertyListing,
  PropertySearchPayload,
  UnderwriteOutput,
  PipelineRunResponse,
} from './api/types';
import {
  useFinalAnalysis,
  useHistorySearch,
  usePipelineRun,
  useSearchProperties,
  fetchAgentConversation,
  savePropertyOverrideApi,
  streamAgentConversationMessage,
} from './api/hooks';
import { useWorkspaceStore } from './store/workspaceStore';
import { cloneAssumptions, defaultAssumptionOverrides, defaultSearchValues } from './constants/defaults';
import type { ChatMessage, ResultFilters } from './types/ui';
import api from './api/client';
import './App.css';

const sanitizePropertyOverride = (input: AssumptionOverrides | null): AssumptionOverrides | null => {
  if (!input) {
    return null;
  }
  const cleaned: AssumptionOverrides = {};
  const assignIfNumber = <K extends keyof AssumptionOverrides>(key: K) => {
    const value = input[key];
    if (typeof value === 'number' && !Number.isNaN(value)) {
      cleaned[key] = value as AssumptionOverrides[K];
    }
  };
  (
    [
      'monthly_rent_override',
      'vacancy_rate_pct',
      'mgmt_fee_pct_of_egi',
      'insurance_rate_of_value',
      'taxes_annual_fixed',
      'down_payment_pct',
      'closing_costs_pct',
      'initial_repairs',
      'renovation_cost_estimate',
      'interest_rate_annual',
      'loan_term_years',
      'tax_rate_pct',
    ] as const
  ).forEach((key) => assignIfNumber(key));
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

const sortPipelineRows = (rows: PipelineRow[]) => {
  const sorted = [...rows];
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
};

const normalizeTimestamp = (value: number) => (value < 1_000_000_000_000 ? value * 1000 : value);

const normalizeChatMessage = (message: ChatMessage): ChatMessage => ({
  ...message,
  timestamp: normalizeTimestamp(typeof message.timestamp === 'number' ? message.timestamp : Date.now()),
  sources: message.sources ?? (message.sources === null ? null : undefined),
});

const adaptServerMessages = (messages?: AgentConversationResponse['messages']): ChatMessage[] =>
  (messages ?? []).map((message) =>
    normalizeChatMessage({
      id: message.id ?? crypto.randomUUID(),
      role: message.role as ChatMessage['role'],
      content: message.content ?? '',
      timestamp: typeof message.timestamp === 'number' ? message.timestamp : Date.now(),
      sources: message.sources ?? undefined,
    })
  );

const buildChatIntroMessage = (listing?: PropertyListing | null): ChatMessage => ({
  id: crypto.randomUUID(),
  role: 'system',
  content: listing
    ? `Discussing ${listing.address ?? 'this property'}. Ask about underwriting, risks, or scenario tweaks.`
    : 'Discussing this property. Ask about underwriting, risks, or scenario tweaks.',
  timestamp: Date.now(),
  sources: undefined,
});

function App() {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const searchResults = useWorkspaceStore((state) => state.searchResults);
  const lastSearchId = useWorkspaceStore((state) => state.lastSearchId);
  const selectedZpids = useWorkspaceStore((state) => state.selectedZpids);
  const pipelineOptions = useWorkspaceStore((state) => state.pipelineOptions);
  const pipelineResults = useWorkspaceStore((state) => state.pipelineResults);
  const pipelineLabel = useWorkspaceStore((state) => state.pipelineLabel);
  const propertyOverrides = useWorkspaceStore((state) => state.propertyOverrides);
  const resultFilters = useWorkspaceStore((state) => state.resultFilters);
  const forceAgentRun = useWorkspaceStore((state) => state.forceAgentRun);
  const forceFinalRun = useWorkspaceStore((state) => state.forceFinalRun);
  const sidebarOpen = useWorkspaceStore((state) => state.sidebarOpen);
  const setSearchResultsStore = useWorkspaceStore((state) => state.setSearchResults);
  const toggleSelection = useWorkspaceStore((state) => state.toggleSelection);
  const selectAllFromResults = useWorkspaceStore((state) => state.selectAllFromResults);
  const clearSelection = useWorkspaceStore((state) => state.clearSelection);
  const setPipelineOptionsStore = useWorkspaceStore((state) => state.setPipelineOptions);
  const setPipelineResultsStore = useWorkspaceStore((state) => state.setPipelineResults);
  const setPipelineLabelStore = useWorkspaceStore((state) => state.setPipelineLabel);
  const setPropertyOverridesStore = useWorkspaceStore((state) => state.setPropertyOverrides);
  const replacePropertyOverridesStore = useWorkspaceStore((state) => state.replacePropertyOverrides);
  const setResultFiltersStore = useWorkspaceStore((state) => state.setResultFilters);
  const resetResultFilters = useWorkspaceStore((state) => state.resetResultFilters);
  const setForceAgentRunStore = useWorkspaceStore((state) => state.setForceAgentRun);
  const setForceFinalRunStore = useWorkspaceStore((state) => state.setForceFinalRun);
  const setSidebarOpenStore = useWorkspaceStore((state) => state.setSidebarOpen);
  const clearWorkspace = useWorkspaceStore((state) => state.clearWorkspace);
  const [drawerZpid, setDrawerZpid] = useState<string | null>(null);
  const [detailMap, setDetailMap] = useState<Record<string, FinalAnalysisResponse>>({});
  const [agentMap, setAgentMap] = useState<Record<string, UnderwriteOutput>>({});
  const [finalizingId, setFinalizingId] = useState<string | null>(null);
  const [pipelineControlsOpen, setPipelineControlsOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(true);
  const [historyLoadingId, setHistoryLoadingId] = useState<number | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatListing, setChatListing] = useState<PropertyListing | null>(null);
  const [chatPipelineRow, setChatPipelineRow] = useState<PipelineRow | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatSending, setChatSending] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }
    return window.localStorage.getItem('uwb-welcome-dismissed') !== 'true';
  });
  const [chatInitializing, setChatInitializing] = useState(false);
  const overrideTimersRef = useRef<Record<string, number>>({});
  const overrideControllersRef = useRef<Record<string, AbortController>>({});
  const chatTargetRef = useRef<string | null>(null);
  const chatStreamControllerRef = useRef<AbortController | null>(null);
  const listingsByZpid = useMemo(() => {
    const map: Record<string, PropertyListing> = {};
    searchResults.forEach((listing) => {
      map[String(listing.zpid)] = listing;
    });
    return map;
  }, [searchResults]);
  const pipelineRowsByZpid = useMemo(() => {
    const map: Record<string, PipelineRow> = {};
    pipelineResults.forEach((row) => {
      map[row.zpid] = row;
    });
    return map;
  }, [pipelineResults]);
  const searchMutation = useSearchProperties();
  const pipelineMutation = usePipelineRun();
  const finalMutation = useFinalAnalysis();
  const historyMutation = useHistorySearch();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const toolbarHeight = isDesktop ? 64 : 56;
  const assumptionOverrides =
    pipelineOptions.assumption_overrides ?? cloneAssumptions(defaultAssumptionOverrides);
  const defaultDownPaymentPct =
    assumptionOverrides.down_payment_pct ?? defaultAssumptionOverrides.down_payment_pct ?? 0.25;
  const latestDataRef = useRef({
    pipelineResults,
    pipelineOptions,
    listingsByZpid,
    lastSearchId,
    propertyOverrides,
  });
  const chatMessagesRef = useRef<ChatMessage[]>([]);

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

  const runPipelineForListings = useCallback(
    (targetListings: PropertyListing[], searchIdOverride?: number | null) => {
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
      setPipelineResultsStore([]);
      pipelineMutation.mutate(
        {
          listings: targetListings,
          options: pipelineOptions,
          search_id: searchIdOverride ?? lastSearchId,
          label: pipelineLabel || undefined,
          listing_overrides: listingOverrides,
        },
        {
          onSuccess: (data) => {
            setPipelineResultsStore(sortPipelineRows(data.results));
            enqueueSnackbar('Pipeline completed', { variant: 'success' });
            queryClient.invalidateQueries({ queryKey: ['pipeline-history'] }).catch(() => {});
          },
          onError: (error) => enqueueSnackbar(error.message, { variant: 'error' }),
        }
      );
    },
    [
      enqueueSnackbar,
      pipelineMutation,
      pipelineOptions,
      propertyOverrides,
      pipelineLabel,
      lastSearchId,
      setPipelineResultsStore,
      queryClient,
    ]
  );

  useEffect(() => {
    latestDataRef.current = {
      pipelineResults,
      pipelineOptions,
      listingsByZpid,
      lastSearchId,
      propertyOverrides,
    };
  }, [pipelineResults, pipelineOptions, listingsByZpid, lastSearchId, propertyOverrides]);

  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  useEffect(() => {
    return () => {
      Object.values(overrideTimersRef.current).forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      Object.values(overrideControllersRef.current).forEach((controller) => {
        controller.abort();
      });
    };
  }, []);

  useEffect(() => {
    if (chatListing) {
      const latestRow = pipelineRowsByZpid[String(chatListing.zpid)];
      setChatPipelineRow(latestRow ?? null);
    }
  }, [chatListing, pipelineRowsByZpid]);

  const syncOverridesFromServer = useCallback(
    (incoming?: Record<string, AssumptionOverrides | null> | null) => {
      if (!incoming) {
        replacePropertyOverridesStore({});
        return null;
      }
      const sanitized: Record<string, AssumptionOverrides> = {};
      Object.entries(incoming).forEach(([key, value]) => {
        const clean = sanitizePropertyOverride(value ?? null);
        if (clean) {
          sanitized[key] = {
            ...clean,
            base_monthlies: clean.base_monthlies ? { ...clean.base_monthlies } : clean.base_monthlies,
          };
        }
      });
      replacePropertyOverridesStore(sanitized);
      return sanitized;
    },
    [replacePropertyOverridesStore]
  );

  const handleAssumptionOverridesChange = (next: AssumptionOverrides) => {
    setPipelineOptionsStore((prev) => ({
      ...prev,
      assumption_overrides: {
        ...next,
        base_monthlies: next.base_monthlies ? { ...next.base_monthlies } : next.base_monthlies,
      },
    }));
  };

  const handleResetAssumptions = () => {
    setPipelineOptionsStore((prev) => ({
      ...prev,
      assumption_overrides: cloneAssumptions(defaultAssumptionOverrides),
    }));
  };

  const handleSearch = (values: PropertySearchPayload) => {
    searchMutation.mutate(values, {
      onSuccess: (data) => {
        const normalized = (data.props ?? [])
          .filter((item) => item.zpid ?? (item as any).zpidId)
          .map((item) => ({
            ...item,
            zpid: String(item.zpid ?? (item as any).zpidId ?? crypto.randomUUID()),
          }));
        setSearchResultsStore(normalized, {
          autoSelect: true,
          searchId: data.search_id ?? null,
        });
        syncOverridesFromServer(data.property_overrides ?? null);
        resetResultFilters();
        setPipelineResultsStore([]);
        runPipelineForListings(normalized, data.search_id ?? null);
        setSearchDialogOpen(false);
        enqueueSnackbar(`Loaded ${normalized.length} listings`, { variant: 'success' });
        queryClient.invalidateQueries({ queryKey: ['searchHistory'] }).catch(() => {});
      },
      onError: (error) => enqueueSnackbar(error.message, { variant: 'error' }),
    });
  };

  const handleToggleSelection = (zpid: string) => {
    toggleSelection(zpid);
  };

  const handleRunPipeline = useCallback(() => {
    const targetListings = (selectedZpids.size
      ? Array.from(selectedZpids)
      : searchResults.map((item) => String(item.zpid))
    )
      .map((zpid) => listingsByZpid[zpid])
      .filter(Boolean) as PropertyListing[];
    runPipelineForListings(targetListings);
  }, [selectedZpids, searchResults, listingsByZpid, runPipelineForListings]);

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
          setPipelineResultsStore((prev) =>
            sortPipelineRows(
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
            )
          );
          enqueueSnackbar('Final detail retrieved', { variant: 'success' });
        },
        onError: (error) => enqueueSnackbar(error.message, { variant: 'error' }),
        onSettled: () => setFinalizingId(null),
      }
    );
  };

  const recomputePipelineEntry = useCallback(
    async (zpid: string, overrideOverride?: AssumptionOverrides | null) => {
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
      if (overrideControllersRef.current[zpid]) {
        overrideControllersRef.current[zpid].abort();
      }
      const controller = new AbortController();
      overrideControllersRef.current[zpid] = controller;
      try {
        const { data } = await api.post<PipelineRunResponse>(
          '/api/pipeline/run',
          {
            listings: [listing],
            options: singleRunOptions,
            search_id: currentSearchId,
            listing_overrides: listingOverridePayload,
            skip_history: true,
          },
          { signal: controller.signal }
        );
        const updatedRow = data.results[0];
        if (!updatedRow) {
          enqueueSnackbar('Override update succeeded but returned no data.', { variant: 'warning' });
          return;
        }
        let clearedFinal = false;
        setPipelineResultsStore((prev) => {
          let touched = false;
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
          return sortPipelineRows(mapped);
        });
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
      } catch (error: any) {
        if (controller.signal.aborted || error?.name === 'CanceledError') {
          return;
        }
        enqueueSnackbar(error.message ?? 'Override update failed', { variant: 'error' });
      } finally {
        delete overrideControllersRef.current[zpid];
      }
    },
    [enqueueSnackbar, setPipelineResultsStore]
  );

  const persistPropertyOverride = useCallback(
    async (zpid: string, override: AssumptionOverrides | null) => {
      try {
        await savePropertyOverrideApi({
          zpid,
          search_id: lastSearchId ?? undefined,
          overrides: override ?? undefined,
        });
      } catch (error: any) {
        enqueueSnackbar(error?.message ?? 'Unable to persist property override', { variant: 'warning' });
      }
    },
    [lastSearchId, enqueueSnackbar]
  );

  const handlePropertyOverrideChange = (zpid: string, next: AssumptionOverrides | null) => {
    const sanitized = sanitizePropertyOverride(next);
    setPropertyOverridesStore((prev) => {
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
      recomputePipelineEntry(zpid, sanitized);
    }, 600);
    persistPropertyOverride(zpid, sanitized);
  };

  const handleSelectAll = () => selectAllFromResults();
  const handleClearSelection = () => clearSelection();
  const handleClearResults = () => {
    clearWorkspace();
    setDetailMap({});
    setAgentMap({});
    setSearchDialogOpen(true);
    resetResultFilters();
  };

  const handleLoadHistory = (searchId: number) => {
    setHistoryLoadingId(searchId);
    historyMutation.mutate(searchId, {
      onSuccess: (data) => {
        const normalized = (data.props ?? []).map((item) => ({
          ...item,
          zpid: String(item.zpid ?? (item as any).zpidId ?? crypto.randomUUID()),
        }));
        setSearchResultsStore(normalized, {
          autoSelect: true,
          searchId: data.search_id ?? null,
        });
        const overridesFromServer = syncOverridesFromServer(data.property_overrides ?? null);
        resetResultFilters();
        if (data.pipeline_label) {
          setPipelineLabelStore(data.pipeline_label);
        }
        if (data.pipeline_options) {
          const incomingOptions = data.pipeline_options;
          setPipelineOptionsStore((prev) => ({
            ...prev,
            fetch_details_for_promising:
              typeof incomingOptions.fetch_details_for_promising === 'boolean'
                ? incomingOptions.fetch_details_for_promising
                : prev.fetch_details_for_promising,
            max_detail_fetches: incomingOptions.max_detail_fetches ?? prev.max_detail_fetches,
            detail_sleep_sec: incomingOptions.detail_sleep_sec ?? prev.detail_sleep_sec,
            use_agent_for_final:
              typeof incomingOptions.use_agent_for_final === 'boolean'
                ? incomingOptions.use_agent_for_final
                : prev.use_agent_for_final,
            assumption_overrides: incomingOptions.assumption_overrides
              ? {
                  ...cloneAssumptions(defaultAssumptionOverrides),
                  ...incomingOptions.assumption_overrides,
                  base_monthlies: incomingOptions.assumption_overrides.base_monthlies
                    ? { ...incomingOptions.assumption_overrides.base_monthlies }
                    : incomingOptions.assumption_overrides.base_monthlies,
                }
              : prev.assumption_overrides,
          }));
        }
        if (data.pipeline_results && data.pipeline_results.length) {
          setPipelineResultsStore(sortPipelineRows(data.pipeline_results));
          if (overridesFromServer && Object.keys(overridesFromServer).length) {
            window.setTimeout(() => {
              Object.entries(overridesFromServer).forEach(([overrideZpid, overrideValue]) => {
                recomputePipelineEntry(overrideZpid, overrideValue);
              });
            }, 0);
          }
        } else {
          setPipelineResultsStore([]);
          runPipelineForListings(normalized, data.search_id ?? null);
        }
        setSearchDialogOpen(false);
        enqueueSnackbar(`Loaded ${normalized.length} listings from history`, { variant: 'info' });
      },
      onError: (error) => enqueueSnackbar(error.message, { variant: 'error' }),
      onSettled: () => setHistoryLoadingId(null),
    });
  };


  const handleFiltersChange = (filters: ResultFilters) => {
    setResultFiltersStore(filters);
  };

  const handleOpenChat = (listing: PropertyListing) => {
    const zpid = String(listing.zpid);
    chatStreamControllerRef.current?.abort();
    chatStreamControllerRef.current = null;
    chatTargetRef.current = zpid;
    setChatListing(listing);
    setChatPipelineRow(pipelineRowsByZpid[zpid] ?? null);
    setChatMessages([normalizeChatMessage(buildChatIntroMessage(listing))]);
    setChatOpen(true);
    setChatInitializing(true);
    fetchAgentConversation(zpid)
      .then((data) => {
        if (chatTargetRef.current !== zpid) {
          return;
        }
        const adapted = adaptServerMessages(data.messages);
        if (adapted.length) {
          setChatMessages(adapted);
        } else {
          setChatMessages([normalizeChatMessage(buildChatIntroMessage(listing))]);
        }
      })
      .catch((error: any) => {
        if (chatTargetRef.current === zpid) {
          setChatMessages([normalizeChatMessage(buildChatIntroMessage(listing))]);
        }
        enqueueSnackbar(error?.message ?? 'Unable to load conversation history.', { variant: 'warning' });
      })
      .finally(() => {
        if (chatTargetRef.current === zpid) {
          setChatInitializing(false);
        }
      });
  };

  const handleCloseChat = () => {
    chatStreamControllerRef.current?.abort();
    chatStreamControllerRef.current = null;
    setChatOpen(false);
    setChatListing(null);
    setChatPipelineRow(null);
    setChatMessages([]);
    setChatSending(false);
    setChatInitializing(false);
    chatTargetRef.current = null;
  };

  const handleSendChatMessage = async (content: string) => {
    if (!chatListing) {
      return;
    }
    const listingSnapshot = chatListing;
    const activeZpid = String(listingSnapshot.zpid);
    const userMessage: ChatMessage = normalizeChatMessage({
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now(),
    });
    setChatMessages((prev) => [...prev, userMessage]);

    const activeRow = chatPipelineRow ?? pipelineRowsByZpid[String(listingSnapshot.zpid)];
    const inputs = (activeRow?.final_inputs ?? activeRow?.coarse_inputs) as Record<string, unknown> | undefined;
    if (!inputs) {
      setChatMessages((prev) => [
        ...prev,
        normalizeChatMessage({
          id: crypto.randomUUID(),
          role: 'agent',
          content: 'Hang tight—pipeline metrics are still computing. Try again once the deal has been scored.',
          timestamp: Date.now(),
        }),
      ]);
      return;
    }

    const agentMessageId = crypto.randomUUID();
    const placeholderMessage: ChatMessage = normalizeChatMessage({
      id: agentMessageId,
      role: 'agent',
      content: '',
      timestamp: Date.now(),
    });
    setChatMessages((prev) => [...prev, placeholderMessage]);
    setChatSending(true);

    const listingPayload: Record<string, unknown> = {
      analyze_multifamily: inputs,
      property_snapshot: listingSnapshot,
    };
    const controller = new AbortController();
    if (chatStreamControllerRef.current) {
      chatStreamControllerRef.current.abort();
    }
    chatStreamControllerRef.current = controller;

    const updateAgentPlaceholder = (delta: string) => {
      if (chatTargetRef.current !== activeZpid) {
        return;
      }
      setChatMessages((prev) =>
        prev.map((msg) =>
          msg.id === agentMessageId ? { ...msg, content: `${msg.content ?? ''}${delta}` } : msg
        )
      );
    };

    try {
      const streamed = await streamAgentConversationMessage(
        activeZpid,
        {
          question: content,
          listing_payload: listingPayload,
          search_id: lastSearchId ?? undefined,
        },
        {
          signal: controller.signal,
          onToken: (delta) => updateAgentPlaceholder(delta),
        }
      );
      if (chatTargetRef.current === activeZpid) {
        let finalData = streamed;
        if (!finalData) {
          try {
            finalData = await fetchAgentConversation(activeZpid);
          } catch {
            finalData = null;
          }
        }
        if (finalData) {
          const adapted = adaptServerMessages(finalData.messages);
          if (adapted.length) {
            setChatMessages(adapted);
          } else {
            setChatMessages([normalizeChatMessage(buildChatIntroMessage(listingSnapshot))]);
          }
        }
      }
    } catch (error: any) {
      if (controller.signal.aborted) {
        return;
      }
      enqueueSnackbar(error?.message ?? 'Agent chat failed', { variant: 'error' });
      if (chatTargetRef.current === activeZpid) {
        setChatMessages((prev) =>
          prev.map((msg) =>
            msg.id === agentMessageId
              ? {
                  ...msg,
                  content: 'I was unable to generate a response. Please try again in a moment.',
                }
              : msg
          )
        );
      }
      try {
        const latest = await fetchAgentConversation(activeZpid);
        if (chatTargetRef.current === activeZpid) {
          const adapted = adaptServerMessages(latest.messages);
          if (adapted.length) {
            setChatMessages(adapted);
          }
        }
      } catch {
        // ignore sync errors
      }
    } finally {
      if (chatTargetRef.current === activeZpid) {
        setChatSending(false);
      }
      if (chatStreamControllerRef.current === controller) {
        chatStreamControllerRef.current = null;
      }
    }
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
  useEffect(() => {
    if (!showWelcome && typeof window !== 'undefined') {
      window.localStorage.setItem('uwb-welcome-dismissed', 'true');
    }
  }, [showWelcome]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', overflow: 'hidden', position: 'relative' }}>
      {showWelcome ? (
        <Box
          onClick={() => setShowWelcome(false)}
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: (theme) => theme.zIndex.modal + 2,
            background: 'radial-gradient(circle at top, rgba(61,90,254,0.9), rgba(13,25,43,0.98))',
            color: 'common.white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            px: 3,
            cursor: 'pointer',
          }}
        >
          <Box
            sx={{
              maxWidth: 640,
              p: { xs: 3, md: 4 },
              borderRadius: 4,
              border: '1px solid rgba(255,255,255,0.2)',
              backdropFilter: 'blur(12px)',
              backgroundColor: 'rgba(13,25,43,0.45)',
              boxShadow: '0 20px 80px rgba(0,0,0,0.45)',
            }}
          >
            <Typography variant="overline" sx={{ letterSpacing: 3, opacity: 0.8 }}>
              Multifamily Underwriting Workbench
            </Typography>
            <Typography variant="h3" sx={{ fontWeight: 700, mt: 1, mb: 2 }}>
              Welcome to your deal desk
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.9 }}>
              Search for multifamily listings, run them through deterministic underwriting, and tap the agent copilot
              for nuanced insight. Pipelines, assumptions, and history are preserved so you can pick up diligence right
              where you left off.
            </Typography>
            <Stack spacing={1.5} sx={{ mt: 3 }} alignItems="center">
              <Stack spacing={1} direction="row" flexWrap="wrap" justifyContent="center">
                <Chip label="Rapid screening" color="default" sx={{ bgcolor: 'rgba(255,255,255,0.12)', color: 'inherit' }} />
                <Chip label="Agent guidance" color="default" sx={{ bgcolor: 'rgba(255,255,255,0.12)', color: 'inherit' }} />
                <Chip label="Map & history" color="default" sx={{ bgcolor: 'rgba(255,255,255,0.12)', color: 'inherit' }} />
              </Stack>
              <Typography variant="body2" sx={{ opacity: 0.8 }}>
                Click anywhere to enter the workspace
              </Typography>
            </Stack>
          </Box>
        </Box>
      ) : null}
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
            onClick={() => setSidebarOpenStore(!sidebarOpen)}
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
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <SidebarLayout
          open={sidebarOpen}
          onToggle={() => setSidebarOpenStore(!sidebarOpen)}
          topOffset={toolbarHeight}
          sidebar={
            <Stack spacing={3} sx={{ mt: 3 }}>
              <SearchHistory
                onSelect={handleLoadHistory}
                loadingId={historyLoadingId}
              />
            </Stack>
          }
        >
          <Container maxWidth="xl" sx={{ py: 4 }}>
            <Stack spacing={3}>
              <Stack spacing={2}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  alignItems={{ xs: 'flex-start', sm: 'center' }}
                  justifyContent="space-between"
                >
                  <Typography variant="body2" color="text.secondary">
                    Listings auto-run through the pipeline after each search. Adjust assumptions anytime.
                  </Typography>
                  <Button
                    variant="outlined"
                    startIcon={<SettingsSuggestIcon />}
                    onClick={() => setPipelineControlsOpen(true)}
                    sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }}
                  >
                    Pipeline Settings
                  </Button>
                </Stack>
                <PropertyResults
                  results={filteredResults}
                  totalCount={searchResults.length}
                  selected={selectedZpids}
                  filters={resultFilters}
                  onFiltersChange={handleFiltersChange}
                  onToggle={handleToggleSelection}
                  onSelectAll={handleSelectAll}
                  onClearSelection={handleClearSelection}
                  onClearResults={handleClearResults}
                  onRowClick={(listing) => setDrawerZpid(String(listing.zpid))}
                  getDownPaymentPct={getDownPaymentPct}
                  pipelineRowsByZpid={pipelineRowsByZpid}
                  pipelineLoading={pipelineMutation.isPending}
                  onOpenChat={handleOpenChat}
                  onFinalize={handleFinalize}
                  finalizingId={finalizingId}
                />
              </Stack>
              <PipelineControlsDialog
                open={pipelineControlsOpen}
                onClose={() => setPipelineControlsOpen(false)}
                pipelineOptions={pipelineOptions}
                updatePipelineOptions={setPipelineOptionsStore}
                assumptionOverrides={assumptionOverrides}
                defaultAssumptions={defaultAssumptionOverrides}
                onAssumptionsChange={handleAssumptionOverridesChange}
                onResetAssumptions={handleResetAssumptions}
                pipelineLabel={pipelineLabel}
                onPipelineLabelChange={setPipelineLabelStore}
                forceAgentRun={forceAgentRun}
                onForceAgentRunChange={setForceAgentRunStore}
                forceFinalRun={forceFinalRun}
                onForceFinalRunChange={setForceFinalRunStore}
                onRunPipeline={handleRunPipeline}
                isRunning={pipelineMutation.isPending}
              />
              <Dialog
                open={searchDialogOpen}
                onClose={() => setSearchDialogOpen(false)}
                fullWidth
                maxWidth="md"
                PaperProps={{
                  sx: {
                    overflow: 'hidden',
                    borderRadius: 4,
                  },
                }}
              >
                <Box
                  sx={{
                    position: 'relative',
                    background: 'linear-gradient(135deg, #1d4ed8, #4338ca 55%, #9333ea)',
                    color: 'common.white',
                    p: { xs: 3, md: 4 },
                  }}
                >
                  <Stack spacing={1}>
                    <Typography variant="overline" sx={{ letterSpacing: 3, opacity: 0.85 }}>
                      New search
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 700 }}>
                      Explore a market in seconds
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.8, maxWidth: 520 }}>
                      Define a geography and price band, then let the pipeline auto-score every property. Adjust your
                      underwriting assumptions at any point.
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap">
                    <Chip label="Rapid screening" sx={{ bgcolor: 'rgba(255,255,255,0.15)', color: 'inherit' }} />
                    <Chip label="Agent-ready" sx={{ bgcolor: 'rgba(255,255,255,0.15)', color: 'inherit' }} />
                    <Chip label="Map aware" sx={{ bgcolor: 'rgba(255,255,255,0.15)', color: 'inherit' }} />
                  </Stack>
                </Box>
                <DialogContent sx={{ p: { xs: 3, md: 4 } }}>
                  <Stack spacing={2.5}>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1}
                      alignItems={{ xs: 'flex-start', sm: 'center' }}
                      justifyContent="space-between"
                    >
                      <Typography variant="body2" color="text.secondary">
                        Prefill defaults or tweak anything before running the pipeline.
                      </Typography>
                      <Button
                        variant="outlined"
                        startIcon={<SettingsSuggestIcon />}
                        onClick={() => setPipelineControlsOpen(true)}
                        sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }}
                      >
                        Pipeline settings
                      </Button>
                    </Stack>
                    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
                      <SearchForm
                        defaultValues={defaultSearchValues}
                        onSubmit={handleSearch}
                        isLoading={searchMutation.isPending}
                        onResetFilters={resetResultFilters}
                      />
                    </Paper>
                  </Stack>
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
        onPropertyOverrideChange={drawerZpid ? (next) => handlePropertyOverrideChange(drawerZpid, next) : undefined}
      />
      <AgentChatDrawer
        open={chatOpen}
        onClose={handleCloseChat}
        listing={chatListing}
        pipelineRow={chatPipelineRow ?? undefined}
        messages={chatMessages}
        onSend={handleSendChatMessage}
        isSending={chatSending}
        isLoading={chatInitializing}
      />
    </Box>
  );
}

export default App;
