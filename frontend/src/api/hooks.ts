import { useMutation, useQuery } from '@tanstack/react-query';
import api, { API_BASE_URL } from './client';
import type {
  AgentConversationRequest,
  AgentConversationResponse,
  FinalAnalysisPayload,
  FinalAnalysisResponse,
  PipelineRunRequest,
  PipelineRunResponse,
  PropertyOverridePayload,
  PropertyOverridesResponse,
  PropertySearchPayload,
  SearchHistoryResponse,
  SearchResponse,
  UnderwritingConfig,
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

interface AgentStreamHandlers {
  onToken?: (delta: string) => void;
  onComplete?: (conversation: AgentConversationResponse) => void;
  signal?: AbortSignal;
}

export const streamAgentConversationMessage = async (
  zpid: string,
  payload: AgentConversationRequest,
  handlers: AgentStreamHandlers = {}
): Promise<AgentConversationResponse | null> => {
  const response = await fetch(`${API_BASE_URL}/api/agent/conversations/${zpid}?stream=true`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(payload),
    signal: handlers.signal,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Streaming agent response failed to start.');
  }
  if (!response.body) {
    throw new Error('Streaming agent response is empty.');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let resolved: AgentConversationResponse | null = null;

  const emitPayload = (payloadText: string) => {
    if (!payloadText) {
      return;
    }
    let parsed: any;
    try {
      parsed = JSON.parse(payloadText);
    } catch (error) {
      console.error('Failed to parse SSE payload', payloadText, error);
      return;
    }
    if (parsed.type === 'token' && typeof parsed.delta === 'string') {
      handlers.onToken?.(parsed.delta);
      return;
    }
    if (parsed.type === 'complete' && parsed.conversation) {
      resolved = parsed.conversation as AgentConversationResponse;
      handlers.onComplete?.(resolved);
      return;
    }
    if (parsed.type === 'error') {
      throw new Error(parsed.message ?? 'Agent failed to respond.');
    }
  };

  const flushBuffer = () => {
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const dataLines = rawEvent
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim());
      const payloadText = dataLines.join('\n').trim();
      if (payloadText) {
        emitPayload(payloadText);
      }
      boundary = buffer.indexOf('\n\n');
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r/g, '');
      flushBuffer();
    }
    buffer += decoder.decode();
    buffer = buffer.replace(/\r/g, '');
    flushBuffer();
  } finally {
    reader.releaseLock();
  }

  return resolved;
};

export const fetchPropertyOverridesApi = async (searchId?: number | null) => {
  const params = typeof searchId === 'number' ? { params: { search_id: searchId } } : undefined;
  const { data } = await api.get<PropertyOverridesResponse>('/api/property-overrides', params);
  return data;
};

export const savePropertyOverrideApi = async (payload: PropertyOverridePayload) => {
  const { data } = await api.post<PropertyOverridesResponse>('/api/property-overrides', payload);
  return data;
};

export function useConfig() {
  return useQuery<UnderwritingConfig, Error>({
    queryKey: ['config'],
    queryFn: async () => {
      const { data } = await api.get('/api/config');
      return data;
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
