import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  TextField,
  Typography,
  CircularProgress,
  Chip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import type { PropertyListing, PipelineRow } from '../api/types';
import type { ChatMessage } from '../types/ui';

interface AgentChatDrawerProps {
  open: boolean;
  onClose: () => void;
  listing?: PropertyListing | null;
  pipelineRow?: PipelineRow | null;
  messages: ChatMessage[];
  onSend: (content: string) => void;
  isSending: boolean;
  isLoading: boolean;
}

const normalizeTimestamp = (timestamp: number) => (timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp);

const formatTimestamp = (timestamp: number) =>
  new Date(normalizeTimestamp(timestamp)).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });

const AgentChatDrawer = ({
  open,
  onClose,
  listing,
  pipelineRow,
  messages,
  onSend,
  isSending,
  isLoading,
}: AgentChatDrawerProps) => {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canSubmit = draft.trim().length > 0 && !isSending && !isLoading;

  const handleSubmit = (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || isSending || isLoading) {
      return;
    }
    onSend(trimmed);
    setDraft('');
  };

  useEffect(() => {
    if (!open) {
      setDraft('');
    }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const metrics = pipelineRow?.final_metrics ?? pipelineRow?.coarse_metrics;
  const stageLabel = pipelineRow ? (pipelineRow.stage === 'final' ? 'Final metrics' : 'Coarse metrics') : null;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pr: 6 }}>
        <Typography variant="h6">Deal Copilot</Typography>
        <Typography variant="body2" color="text.secondary">
          {listing?.address ?? 'No property selected'}
        </Typography>
        <IconButton onClick={onClose} sx={{ position: 'absolute', top: 8, right: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <Box sx={{ p: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Stack spacing={1}>
            <Typography variant="subtitle2">Snapshot</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {listing?.price ? <Chip label={`Ask $${listing.price.toLocaleString()}`} /> : null}
              {listing?.rentZestimate ? <Chip label={`Rent $${listing.rentZestimate.toLocaleString()}`} /> : null}
              {listing?.bedrooms ? <Chip label={`${listing.bedrooms} beds`} /> : null}
              {listing?.bathrooms ? <Chip label={`${listing.bathrooms} baths`} /> : null}
            </Stack>
            {stageLabel || metrics ? (
              <Stack direction="row" spacing={1} flexWrap="wrap">
                {stageLabel ? (
                  <Chip
                    label={stageLabel}
                    size="small"
                    color={pipelineRow?.stage === 'final' ? 'success' : 'default'}
                    variant="outlined"
                  />
                ) : null}
                {metrics ? (
                  <>
                    <Chip label={`DSCR ${metrics.dscr?.toFixed(2) ?? '—'}`} color="primary" variant="outlined" />
                    <Chip label={`Cap ${(metrics.cap_rate * 100).toFixed(1)}%`} color="secondary" variant="outlined" />
                    <Chip
                      label={`CoC ${(metrics.cash_on_cash * 100).toFixed(1)}%`}
                      color="success"
                      variant="outlined"
                    />
                  </>
                ) : null}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Pipeline metrics pending. You can still ask questions while scoring completes.
              </Typography>
            )}
          </Stack>
        </Box>
        <Box ref={scrollRef} sx={{ height: 360, overflowY: 'auto', px: 3, py: 2 }}>
          {isLoading && messages.length === 0 ? (
            <Stack alignItems="center" justifyContent="center" sx={{ height: '100%' }}>
              <CircularProgress size={28} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Loading conversation…
              </Typography>
            </Stack>
          ) : (
            <Stack spacing={2}>
              {messages.map((message) => (
                <Box key={message.id} sx={{ display: 'flex', flexDirection: 'column', alignItems: message.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <Box
                    sx={{
                      maxWidth: '90%',
                      bgcolor:
                        message.role === 'user'
                          ? 'primary.main'
                          : message.role === 'agent'
                            ? 'grey.100'
                            : 'background.paper',
                      color: message.role === 'user' ? 'primary.contrastText' : 'text.primary',
                      p: 1.5,
                      borderRadius: 2,
                      boxShadow: message.role === 'agent' ? '0 4px 16px rgba(15,23,42,0.12)' : 'none',
                    }}
                  >
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {message.content}
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                    {message.role === 'user' ? 'You' : message.role === 'agent' ? 'Agent' : 'System'} ·{' '}
                    {formatTimestamp(message.timestamp)}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
        <Divider />
        <Box component="form" onSubmit={handleSubmit} sx={{ p: 3 }}>
          <Stack spacing={1.5}>
            <TextField
              multiline
              minRows={2}
              maxRows={4}
              placeholder="Ask about underwriting, risks, or scenario tweaks..."
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={isSending || isLoading}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              {isSending ? <CircularProgress size={20} /> : null}
              <Button type="submit" variant="contained" disabled={!canSubmit}>
                Send
              </Button>
            </Box>
          </Stack>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default AgentChatDrawer;
