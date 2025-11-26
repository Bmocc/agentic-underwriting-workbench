import HistoryIcon from '@mui/icons-material/History';
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
import type { SearchHistoryEntry } from '../api/types';

interface SearchHistoryProps {
  entries?: SearchHistoryEntry[];
  isLoading?: boolean;
  onSelect: (id: number) => void;
  loadingId?: number | null;
}

const SearchHistory = ({ entries, isLoading, onSelect, loadingId }: SearchHistoryProps) => (
  <Paper sx={{ p: 3 }} elevation={3}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
      <Typography variant="h6">Recent Searches</Typography>
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
                  borderColor: isLoadingEntry ? 'primary.light' : 'divider',
                  bgcolor: 'background.paper',
                  p: 1.5,
                  display: 'flex',
                  gap: 2,
                  alignItems: 'center',
                  cursor: isLoadingEntry ? 'not-allowed' : 'pointer',
                  opacity: isLoadingEntry ? 0.7 : 1,
                  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                  boxShadow: isLoadingEntry ? 'inset 0 0 0 1px rgba(37,99,235,0.2)' : 'none',
                  '&:hover': {
                    borderColor: isLoadingEntry ? 'primary.light' : 'primary.main',
                    boxShadow: isLoadingEntry ? 'inset 0 0 0 1px rgba(37,99,235,0.2)' : '0 12px 30px rgba(15,23,42,0.12)',
                  },
                  '&:disabled': {
                    cursor: 'not-allowed',
                  },
                }}
              >
                <ListItemAvatar sx={{ minWidth: 0 }}>
                  <Avatar sx={{ bgcolor: 'primary.light', color: 'primary.contrastText' }}>
                    <HistoryIcon />
                  </Avatar>
                </ListItemAvatar>
                <Box sx={{ flexGrow: 1 }}>
                  <Stack direction="row" spacing={1.5} alignItems={{ xs: 'flex-start', sm: 'center' }} flexWrap="wrap">
                    <Typography variant="subtitle2">{entry.location ?? 'Unknown location'}</Typography>
                    <Chip label={`${entry.result_count} props`} size="small" />
                  </Stack>
                  <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 0.5 }}>
                    <Typography variant="caption">{new Date(entry.created_at).toLocaleString()}</Typography>
                    <Typography variant="caption">• {entry.status_type ?? 'ForSale'}</Typography>
                    <Typography variant="caption">• {entry.home_type}</Typography>
                  </Stack>
                </Box>
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'primary.main', minWidth: 40, justifyContent: 'flex-end' }}>
                  {isLoadingEntry ? <CircularProgress size={18} /> : <ReplayIcon fontSize="small" />}
                </Stack>
              </Box>
            </ListItem>
          );
        })}
      </List>
    ) : (
      <Typography color="text.secondary">Run a search to build your history.</Typography>
    )}
  </Paper>
);

export default SearchHistory;
