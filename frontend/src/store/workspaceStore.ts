import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  AssumptionOverrides,
  PipelineOptions,
  PipelineRow,
  PropertyListing,
} from '../api/types';
import type { ResultFilters, ResultsTabKey } from '../types/ui';
import { buildDefaultPipelineOptions, createDefaultResultFilters } from '../constants/defaults';

const ensureStorage = (): Storage =>
  typeof window === 'undefined'
    ? ({
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
        clear: () => undefined,
        key: () => null,
        get length() {
          return 0;
        },
      } as Storage)
    : window.localStorage;

type OverridesMap = Record<string, AssumptionOverrides>;

interface WorkspaceState {
  searchResults: PropertyListing[];
  lastSearchId: number | null;
  selectedZpids: Set<string>;
  pipelineOptions: PipelineOptions;
  pipelineResults: PipelineRow[];
  pipelineLabel: string;
  propertyOverrides: OverridesMap;
  resultFilters: ResultFilters;
  forceAgentRun: boolean;
  forceFinalRun: boolean;
  resultsTab: ResultsTabKey;
  sidebarOpen: boolean;
  setSearchResults: (
    results: PropertyListing[],
    options?: { autoSelect?: boolean; searchId?: number | null }
  ) => void;
  setLastSearchId: (id: number | null) => void;
  toggleSelection: (zpid: string) => void;
  selectAllFromResults: () => void;
  clearSelection: () => void;
  setPipelineOptions: (
    updater: PipelineOptions | ((prev: PipelineOptions) => PipelineOptions)
  ) => void;
  setPipelineResults: (
    updater: PipelineRow[] | ((rows: PipelineRow[]) => PipelineRow[])
  ) => void;
  setPipelineLabel: (label: string) => void;
  setPropertyOverrides: (updater: (prev: OverridesMap) => OverridesMap) => void;
  replacePropertyOverrides: (next: OverridesMap) => void;
  setResultFilters: (filters: ResultFilters) => void;
  resetResultFilters: () => void;
  setForceAgentRun: (value: boolean) => void;
  setForceFinalRun: (value: boolean) => void;
  setResultsTab: (tab: ResultsTabKey) => void;
  setSidebarOpen: (open: boolean) => void;
  clearWorkspace: () => void;
}

const createInitialState = (): WorkspaceState => ({
  searchResults: [],
  lastSearchId: null,
  selectedZpids: new Set<string>(),
  pipelineOptions: buildDefaultPipelineOptions(),
  pipelineResults: [],
  pipelineLabel: '',
  propertyOverrides: {},
  resultFilters: createDefaultResultFilters(),
  forceAgentRun: false,
  forceFinalRun: false,
  resultsTab: 'search',
  sidebarOpen: true,
  setSearchResults: () => {},
  setLastSearchId: () => {},
  toggleSelection: () => {},
  selectAllFromResults: () => {},
  clearSelection: () => {},
  setPipelineOptions: () => {},
  setPipelineResults: () => {},
  setPipelineLabel: () => {},
  setPropertyOverrides: () => {},
  replacePropertyOverrides: () => {},
  setResultFilters: () => {},
  resetResultFilters: () => {},
  setForceAgentRun: () => {},
  setForceFinalRun: () => {},
  setResultsTab: () => {},
  setSidebarOpen: () => {},
  clearWorkspace: () => {},
});

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, _get) => ({
      ...createInitialState(),
      setSearchResults: (results, options = {}) =>
        set(() => ({
          searchResults: results,
          selectedZpids: options.autoSelect
            ? new Set(results.map((item) => String(item.zpid)))
            : new Set<string>(),
          lastSearchId: options.searchId ?? null,
          resultsTab: 'search',
        })),
      setLastSearchId: (id) => set({ lastSearchId: id }),
      toggleSelection: (zpid) =>
        set((state) => {
          const next = new Set(state.selectedZpids);
          if (next.has(zpid)) {
            next.delete(zpid);
          } else {
            next.add(zpid);
          }
          return { selectedZpids: next };
        }),
      selectAllFromResults: () =>
        set((state) => ({
          selectedZpids: new Set(state.searchResults.map((item) => String(item.zpid))),
        })),
      clearSelection: () =>
        set({
          selectedZpids: new Set(),
        }),
      setPipelineOptions: (updater) =>
        set((state) => ({
          pipelineOptions:
            typeof updater === 'function'
              ? (updater as (prev: PipelineOptions) => PipelineOptions)(state.pipelineOptions)
              : updater,
        })),
      setPipelineResults: (updater) =>
        set((state) => ({
          pipelineResults:
            typeof updater === 'function'
              ? (updater as (rows: PipelineRow[]) => PipelineRow[])(state.pipelineResults)
              : updater,
        })),
      setPipelineLabel: (label) => set({ pipelineLabel: label }),
      setPropertyOverrides: (updater) =>
        set((state) => ({
          propertyOverrides: updater(state.propertyOverrides),
        })),
      replacePropertyOverrides: (next) => set({ propertyOverrides: next }),
      setResultFilters: (filters) => set({ resultFilters: { ...filters } }),
      resetResultFilters: () => set({ resultFilters: createDefaultResultFilters() }),
      setForceAgentRun: (value) => set({ forceAgentRun: value }),
      setForceFinalRun: (value) => set({ forceFinalRun: value }),
      setResultsTab: (tab) => set({ resultsTab: tab }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      clearWorkspace: () =>
        set((state) => ({
          searchResults: [],
          selectedZpids: new Set(),
          lastSearchId: null,
          pipelineResults: [],
          propertyOverrides: {},
          resultFilters: createDefaultResultFilters(),
          resultsTab: 'search',
          // keep persisted preferences (pipeline options, label, toggles)
          pipelineOptions: state.pipelineOptions,
        })),
    }),
    {
      name: 'workspace-store',
      version: 1,
      storage: createJSONStorage(ensureStorage),
      partialize: (state) => ({
        pipelineOptions: state.pipelineOptions,
        pipelineLabel: state.pipelineLabel,
        propertyOverrides: state.propertyOverrides,
        resultFilters: state.resultFilters,
        forceAgentRun: state.forceAgentRun,
        forceFinalRun: state.forceFinalRun,
        sidebarOpen: state.sidebarOpen,
      }),
    }
  )
);
