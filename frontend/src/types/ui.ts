import type { SourceReference } from '../api/types';

export interface ResultFilters {
  query: string;
  minBeds?: number | null;
  maxPrice?: number | null;
}

export type ResultsTabKey = 'search' | 'pipeline';

export type ChatRole = 'system' | 'user' | 'agent';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
  sources?: SourceReference[] | null;
}
