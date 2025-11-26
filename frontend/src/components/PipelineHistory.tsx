import TimelineIcon from '@mui/icons-material/Timeline';
import ReplayIcon from '@mui/icons-material/Replay';
import {
  Box,
  Chip,
  CircularProgress,
  List,
  ListItem,
  ListItemAvatar,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import Avatar from '@mui/material/Avatar';
import type { PipelineHistoryEntry } from '../api/types';

interface PipelineHistoryProps {
  entries?: PipelineHistoryEntry[];
  isLoading?: boolean;
  onSelect: (id: number) => void;
  loadingId?: number | null;
}

const PipelineHistory = ({ entries, isLoading, onSelect, loadingId }: PipelineHistoryProps) => (
  <Paper sx={{ p: 3 }} elevation={3}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
      <Typography variant="h6">Pipeline History</Typography>
      {isLoading ? <CircularProgress size={20} /> : null}
    </Stack>
    {entries && entries.length > 0 ? (
      <List dense disablePadding>
        {entries.map((entry) => {
          const isLoadingEntry = loadingId === entry.id;
          return (
            <ListItem key={entry.id} disablePadding sx={{ mb: 1.2 }}>
              <Box
                component="button"
                type="button"
                onClick={() => onSelect(entry.id)}
                disabled={isLoadingEntry}
                sx={{
                  width: '100%',
                  textAlign: 'left',
                  borderRadius: 3,
                  border: '1px solid',
                  borderColor: isLoadingEntry ? 'secondary.light' : 'divider',
                  bgcolor: 'background.paper',
                  p: 1.5,
                  display: 'flex',
                  gap: 2,
                  alignItems: 'center',
                  cursor: isLoadingEntry ? 'not-allowed' : 'pointer',
                  opacity: isLoadingEntry ? 0.7 : 1,
                  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                  boxShadow: isLoadingEntry ? 'inset 0 0 0 1px rgba(147,51,234,0.2)' : 'none',
                  '&:hover': {
                    borderColor: isLoadingEntry ? 'secondary.light' : 'secondary.main',
                    boxShadow: isLoadingEntry ? 'inset 0 0 0 1px rgba(147,51,234,0.2)' : '0 12px 30px rgba(15,23,42,0.12)',
                  },
                  '&:disabled': { cursor: 'not-allowed' },
                }}
              >
                <ListItemAvatar sx={{ minWidth: 0 }}>
                  <Avatar sx={{ bgcolor: 'secondary.light', color: 'secondary.contrastText' }}>
                    <TimelineIcon />
                  </Avatar>
                </ListItemAvatar>
                <Box sx={{ flexGrow: 1 }}>
                  <Stack direction="row" spacing={1.5} alignItems={{ xs: 'flex-start', sm: 'center' }} flexWrap="wrap">
                    <Typography variant="subtitle2">{entry.label ?? `Run #${entry.id}`}</Typography>
                    <Chip label={`${entry.result_count} deals`} size="small" color="secondary" variant="outlined" />
                  </Stack>
                  <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 0.5 }}>
                    <Typography variant="caption">{new Date(entry.created_at).toLocaleString()}</Typography>
                    {entry.search_id ? <Typography variant="caption">• Search #{entry.search_id}</Typography> : null}
                  </Stack>
                </Box>
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'secondary.main', minWidth: 40, justifyContent: 'flex-end' }}>
                  {isLoadingEntry ? <CircularProgress size={18} /> : <ReplayIcon fontSize="small" />}
                </Stack>
              </Box>
            </ListItem>
          );
        })}
      </List>
    ) : (
      <Typography color="text.secondary">Run the pipeline to build history.</Typography>
    )}
  </Paper>
);

export default PipelineHistory;
