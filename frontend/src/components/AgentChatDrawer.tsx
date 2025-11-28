import { useEffect, useRef, useState } from 'react';
import {
  Avatar,
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
  Tooltip,
  Chip
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useTheme, alpha } from '@mui/material/styles';
import { keyframes } from '@mui/system';
import type { PropertyListing, PipelineRow, SourceReference } from '../api/types';
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

const typingPulse = keyframes`
  0%, 80%, 100% {
    opacity: 0.25;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-3px);
  }
`;

const LoadingDots = ({ color = '#000928', size = 8 }: { color?: string; size?: number }) => (
  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6 }}>
    {[0, 1, 2].map((index) => (
      <Box
        // eslint-disable-next-line react/no-array-index-key
        key={index}
        sx={{
          width: size,
          height: size,
          borderRadius: '50%',
          bgcolor: color,
          animation: `${typingPulse} 1.2s ease-in-out infinite`,
          animationDelay: `${index * 0.18}s`,
        }}
      />
    ))}
  </Box>
);

const MAX_SOURCES = 5;

const getFaviconUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=64`;
  } catch {
    return undefined;
  }
};

const getSourceLabel = (source: SourceReference) => {
  if (source.title) {
    return source.title;
  }
  try {
    const parsed = new URL(source.url);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return source.url;
  }
};

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
  const theme = useTheme();

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
  const bubbleStyles: Record<
    ChatMessage['role'],
    { bgcolor: string; color: string; boxShadow?: string; border?: string; borderColor?: string }
  > = {
    user: {
      bgcolor: 'primary.main',
      color: 'primary.contrastText',
      boxShadow: `0 10px 24px ${alpha(theme.palette.primary.main, 0.35)}`,
    },
    agent: {
      bgcolor: 'common.white',
      color: 'text.primary',
      border: '1px solid',
      borderColor: 'divider',
      boxShadow: `0 6px 20px ${alpha(theme.palette.common.black, 0.12)}`,
    },
    system: {
      bgcolor: 'grey.100',
      color: 'text.secondary',
      border: '1px dashed',
      borderColor: 'grey.300',
    },
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        sx: {
          borderRadius: 4,
          overflow: 'hidden',
        },
      }}
    >
      <DialogTitle sx={{ p: 0 }}>
        <Box
          sx={{
            px: 3,
            py: 2.5,
            background: 'linear-gradient(135deg, #1d4ed8, #4338ca)',
            color: 'common.white',
            position: 'relative',
          }}
        >
          <Stack spacing={0.5}>
            <Typography variant="overline" sx={{ letterSpacing: 2, opacity: 0.8 }}>
              Deal copilot
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {listing?.address ?? 'No property selected'}
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {listing?.price ? <Chip label={`Ask $${listing.price.toLocaleString()}`} size="small" /> : null}
              {listing?.bedrooms ? <Chip label={`${listing.bedrooms} bd`} size="small" /> : null}
              {listing?.bathrooms ? <Chip label={`${listing.bathrooms} ba`} size="small" /> : null}
            </Stack>
          </Stack>
          <IconButton
            onClick={onClose}
            sx={{ position: 'absolute', top: 12, right: 12, color: 'common.white', bgcolor: 'rgba(255,255,255,0.12)' }}
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0, bgcolor: 'background.default' }}>
        <Box sx={{ p: 3, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
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
        <Box
          ref={scrollRef}
          sx={{
            height: 360,
            overflowY: 'auto',
            px: 3,
            py: 2,
            bgcolor: 'grey.50',
          }}
        >
          {isLoading && messages.length === 0 ? (
            <Stack alignItems="center" justifyContent="center" sx={{ height: '100%' }}>
              <CircularProgress size={28} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Loading conversation…
              </Typography>
            </Stack>
          ) : (
            <Stack spacing={2}>
              {messages.map((message) => {
                const isPendingAgent =
                  message.role === 'agent' && (!message.content || !message.content.trim().length);
                return (
                  <Box
                    key={message.id}
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: message.role === 'user' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <Box
                      sx={{
                        maxWidth: '90%',
                        ...bubbleStyles[message.role],
                        p: 1.5,
                        borderRadius: 2,
                        border: bubbleStyles[message.role].border ?? 'none',
                      }}
                    >
                      {isPendingAgent ? (
                        <Stack direction="row" spacing={1} alignItems="center">
                          <LoadingDots color={theme.palette.text.primary} />
                          <Typography variant="body2" color="text.secondary">
                            Agent drafting a reply…
                          </Typography>
                        </Stack>
                      ) : (
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                          {message.content}
                        </Typography>
                      )}
                      {message.sources && message.sources.length ? (
                        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1, gap: 0.75 }}>
                          {message.sources.slice(0, MAX_SOURCES).map((source, index) => {
                            const label = getSourceLabel(source);
                            const favicon = getFaviconUrl(source.url);
                            const title = (
                              <Box>
                                <Typography variant="subtitle2">{label}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {source.url}
                                </Typography>
                              </Box>
                            );
                            return (
                              <Tooltip key={`${message.id}-${index}`} title={title} arrow>
                                <Box
                                  component="a"
                                  href={source.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  sx={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: '50%',
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    bgcolor: 'background.paper',
                                    textDecoration: 'none',
                                  }}
                                >
                                  <Avatar
                                    src={favicon}
                                    alt={label}
                                    sx={{ width: 20, height: 20, bgcolor: 'transparent' }}
                                  >
                                    {label.charAt(0)}
                                  </Avatar>
                                </Box>
                              </Tooltip>
                            );
                          })}
                        </Stack>
                      ) : null}
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                      {message.role === 'user' ? 'You' : message.role === 'agent' ? 'Agent' : 'System'} ·{' '}
                      {formatTimestamp(message.timestamp)}
                    </Typography>
                  </Box>
                );
              })}
            </Stack>
          )}
        </Box>
        <Divider />
        <Box component="form" onSubmit={handleSubmit} sx={{ p: 3, bgcolor: 'background.paper' }}>
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
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 1,
                flexWrap: 'wrap',
              }}
            >
              <Box />
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
