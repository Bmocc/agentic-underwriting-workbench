import { useMutation, useQuery } from '@tanstack/react-query';
import api from './client';
import type {
  AgentConversationRequest,
  AgentConversationResponse,
  FinalAnalysisPayload,
  FinalAnalysisResponse,
  PipelineRunRequest,
  PipelineRunResponse,
  PropertySearchPayload,
  SearchHistoryResponse,
  SearchResponse,
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

export const fetchAgentConversation = async (zpid: string) => {
  const { data } = await api.get<AgentConversationResponse>(`/api/agent/conversations/${zpid}`);
  return data;
};

export const sendAgentConversationMessage = async (
  zpid: string,
  payload: AgentConversationRequest
) => {
  const { data } = await api.post<AgentConversationResponse>(`/api/agent/conversations/${zpid}`, payload);
  return data;
};
