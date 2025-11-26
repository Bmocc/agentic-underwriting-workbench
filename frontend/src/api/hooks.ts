import { useMutation, useQuery } from '@tanstack/react-query';
import api from './client';
import type {
  AgentRunPayload,
  FinalAnalysisPayload,
  FinalAnalysisResponse,
  PipelineHistoryResponse,
  PipelineRunRequest,
  PipelineRunResponse,
  PropertySearchPayload,
  SearchHistoryResponse,
  SearchResponse,
  UnderwriteOutput,
} from './types';

export const useSearchProperties = () =>
  useMutation<SearchResponse, Error, PropertySearchPayload>({
    mutationFn: async (payload) => {
      const { data } = await api.post<SearchResponse>('/api/search', payload);
      return data;
    },
  });

export const usePipelineRun = () =>
  useMutation<PipelineRunResponse, Error, PipelineRunRequest>({
    mutationFn: async (payload) => {
      const { data } = await api.post<PipelineRunResponse>('/api/pipeline/run', payload);
      return data;
    },
  });

export const useAgentRun = () =>
  useMutation<UnderwriteOutput, Error, AgentRunPayload>({
    mutationFn: async ({ listing_payload, zpid, force }) => {
      const { data } = await api.post<UnderwriteOutput>('/api/agent/run', {
        listing_payload,
        zpid,
        force,
        use_agent: true,
      });
      return data;
    },
  });

export const useFinalAnalysis = () =>
  useMutation<FinalAnalysisResponse, Error, FinalAnalysisPayload>({
    mutationFn: async (payload) => {
      const { data } = await api.post<FinalAnalysisResponse>('/api/analyze/final', payload);
      return data;
    },
  });

export const useSearchHistory = () =>
  useQuery<SearchHistoryResponse, Error>({
    queryKey: ['search-history'],
    queryFn: async () => {
      const { data } = await api.get<SearchHistoryResponse>('/api/search/history');
      return data;
    },
  });

export const useHistorySearch = () =>
  useMutation<SearchResponse, Error, number>({
    mutationFn: async (searchId) => {
      const { data } = await api.get<SearchResponse>(`/api/search/history/${searchId}`);
      return data;
    },
  });

export const usePipelineHistory = () =>
  useQuery<PipelineHistoryResponse, Error>({
    queryKey: ['pipeline-history'],
    queryFn: async () => {
      const { data } = await api.get<PipelineHistoryResponse>('/api/pipeline/history');
      return data;
    },
  });

export const usePipelineHistoryEntry = () =>
  useMutation<PipelineRunResponse, Error, number>({
    mutationFn: async (runId) => {
      const { data } = await api.get<PipelineRunResponse>(`/api/pipeline/history/${runId}`);
      return data;
    },
  });
