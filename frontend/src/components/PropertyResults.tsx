import {
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  IconButton,
  InputAdornment,
  Paper,
  Skeleton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import BedOutlinedIcon from '@mui/icons-material/BedOutlined';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ChangeCircleIcon from '@mui/icons-material/ChangeCircle';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Grid from '@mui/material/Grid';
import type { PipelineRow, PropertyListing, UnderwriteMetrics } from '../api/types';
import { lazy, Suspense, useMemo, useState } from 'react';
import type { ResultFilters } from '../types/ui';
import { alpha, useTheme } from '@mui/material/styles';

const MapResultsView = lazy(() => import('./MapResultsView'));


interface PropertyResultsProps {
  results: PropertyListing[];
  selected: Set<string>;
  onToggle: (zpid: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onClearResults: () => void;
  onRowClick?: (listing: PropertyListing) => void;
  totalCount?: number;
  filters: ResultFilters;
  onFiltersChange: (filters: ResultFilters) => void;
  getDownPaymentPct: (zpid: string) => number;
  pipelineRowsByZpid: Record<string, PipelineRow>;
  pipelineLoading: boolean;
  onOpenChat: (listing: PropertyListing) => void;
  onFinalize: (row: PipelineRow) => void;
  finalizingId?: string | null;
}

type MetricsLike = UnderwriteMetrics | Record<string, number> | null | undefined;

const DEAL_BANDS = [
  {
    label: 'Top performer',
    test: (dscr: number, coc: number) => dscr >= 1.3 && coc >= 0.09,
    colors: {
      border: '#16a34a',
      hover: '#15803d',
      glow: 'rgba(22,163,74,0.25)',
      badgeBg: 'rgba(22,163,74,0.15)',
      badgeText: '#14532d',
    },
  },
  {
    label: 'Promising',
    test: (dscr: number, coc: number) => dscr >= 1.18 && coc >= 0.08,
    colors: {
      border: '#0ea5e9',
      hover: '#0284c7',
      glow: 'rgba(14,165,233,0.25)',
      badgeBg: 'rgba(14,165,233,0.12)',
      badgeText: '#0f172a',
    },
  },
  {
    label: 'Needs work',
    test: (dscr: number, coc: number) => dscr >= 1.05 && coc >= 0.06,
    colors: {
      border: '#fbbf24',
      hover: '#f59e0b',
      glow: 'rgba(251,191,36,0.25)',
      badgeBg: 'rgba(251,191,36,0.18)',
      badgeText: '#78350f',
    },
  },
  {
    label: 'High risk',
    test: () => true,
    colors: {
      border: '#f87171',
      hover: '#ef4444',
      glow: 'rgba(248,113,113,0.25)',
      badgeBg: 'rgba(248,113,113,0.2)',
      badgeText: '#7f1d1d',
    },
  },
];

const getDealVisuals = (metrics: MetricsLike) => {
  const dscr = typeof metrics?.dscr === 'number' ? metrics.dscr : 0;
  const coc = typeof metrics?.cash_on_cash === 'number' ? metrics.cash_on_cash : 0;
  const band = DEAL_BANDS.find((item) => item.test(dscr, coc)) ?? DEAL_BANDS[DEAL_BANDS.length - 1];
  return { label: band.label, ...band.colors };
};

const getListingDetailUrl = (listing: PropertyListing) => {
  const media = listing as Record<string, any>;
  const detailPath = typeof media.detailUrl === 'string' ? media.detailUrl : null;
  return detailPath ? `https://www.zillow.com${detailPath}` : null;
};

const PropertyResults = ({
  results,
  selected,
  onToggle,
  onSelectAll,
  onClearSelection,
  onClearResults,
  onRowClick,
  totalCount,
  filters,
  onFiltersChange,
  getDownPaymentPct,
  pipelineRowsByZpid,
  pipelineLoading,
  onOpenChat,
  onFinalize,
  finalizingId,
}: PropertyResultsProps) => {
  const theme = useTheme();
  const allSelected = results.length > 0 && selected.size === results.length;
  const hasFilters = useMemo(() => Boolean(filters.query || filters.minBeds || filters.maxPrice), [filters]);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const listingsWithCoords = useMemo(
    () =>
      results
        .map((listing) => {
          const m = listing as Record<string, unknown>;
          const lat = Number(m.latitude ?? m.lat ?? NaN);
          const lng = Number(m.longitude ?? m.lon ?? m.lng ?? NaN);
          if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
          // Normalize so MapResultsView always receives latitude/longitude fields
          return { ...listing, latitude: lat, longitude: lng } as typeof listing;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    [results]
  );
  const handleClearFilters = () => onFiltersChange({ query: '', minBeds: null, maxPrice: null });

  return (
    <Paper sx={{ p: 3 }} elevation={3}>
      <Stack spacing={2.5}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
          <Box>
            <Typography variant="h6">Search Results</Typography>
            <Typography variant="body2" color="text.secondary">
              Showing {results.length}
              {typeof totalCount === 'number' ? ` of ${totalCount}` : null} properties · Selected {selected.size}
              {hasFilters ? ' · Filters active' : ''}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <ToggleButtonGroup
              size="small"
              value={viewMode}
              exclusive
              onChange={(_, next) => {
                if (next) {
                  setViewMode(next);
                }
              }}
              sx={{ mr: 1 }}
            >
              <ToggleButton value="list">List</ToggleButton>
              <ToggleButton value="map">Map</ToggleButton>
            </ToggleButtonGroup>
            <Button variant="text" onClick={onSelectAll} disabled={results.length === 0}>
              Select All
            </Button>
            <Button variant="text" onClick={onClearSelection} disabled={selected.size === 0}>
              Clear Selection
            </Button>
            <Button variant="text" color="error" onClick={onClearResults} disabled={results.length === 0}>
              Clear Results
            </Button>
          </Stack>
        </Stack>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
          <TextField
            label="Address contains"
            value={filters.query}
            onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })}
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <TextField
            label="Min beds"
            type="number"
            value={filters.minBeds ?? ''}
            onChange={(event) =>
              onFiltersChange({ ...filters, minBeds: event.target.value === '' ? null : Number(event.target.value) })
            }
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <BedOutlinedIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <TextField
            label="Max price"
            type="number"
            value={filters.maxPrice ?? ''}
            onChange={(event) =>
              onFiltersChange({ ...filters, maxPrice: event.target.value === '' ? null : Number(event.target.value) })
            }
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <AttachMoneyIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <Button variant="outlined" onClick={handleClearFilters} sx={{ minWidth: 140 }}>
            Clear filters
          </Button>
        </Stack>
      </Stack>
      {viewMode === 'list' ? (
        <Box
          sx={{
            mt: 3,
            height: { xs: 460, md: 520 },
            overflowY: 'auto',
            pr: 1,
          }}
          aria-busy={pipelineLoading ? 'true' : undefined}
        >
          {pipelineLoading ? (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Pipeline is running. Hang tight while we score these listings…
              </Typography>
              <Grid container spacing={2}>
                {Array.from({ length: Math.min(Math.max(results.length, 4), 6) }).map((_, idx) => (
                  <Grid size={{ xs: 12, lg: 6 }} key={idx}>
                    <Paper
                      variant="outlined"
                      sx={{
                        borderRadius: 3,
                        p: 2,
                      }}
                    >
                      <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 2, mb: 2 }} />
                      <Skeleton width="70%" height={28} />
                      <Skeleton width="40%" />
                      <Skeleton width="60%" />
                      <Skeleton width="85%" />
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </Stack>
          ) : results.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">Run a search to populate this list.</Typography>
            </Paper>
          ) : (
            <Grid container spacing={2}>
              {results.map((listing) => {
                const zpid = String(listing.zpid);
                const checked = selected.has(zpid);
                const media = listing as Record<string, any>;
                const imageUrl = media.imgSrc ?? media.image ?? media.photoUrl ?? media.photo?.url ?? null;
                const downPaymentPct = getDownPaymentPct(zpid);
                const downPaymentAmount = typeof listing.price === 'number' ? listing.price * downPaymentPct : null;
                const pipelineRow = pipelineRowsByZpid[zpid];
                const metrics = pipelineRow?.final_metrics ?? pipelineRow?.coarse_metrics;
                const dscrLabel = metrics && typeof metrics.dscr === 'number' ? metrics.dscr.toFixed(2) : null;
                const cocLabel =
                  metrics && typeof metrics.cash_on_cash === 'number'
                    ? `${(metrics.cash_on_cash * 100).toFixed(1)}%`
                    : null;
                const capLabel =
                  metrics && typeof metrics.cap_rate === 'number'
                    ? `${(metrics.cap_rate * 100).toFixed(1)}%`
                    : null;
                const dealColors = getDealVisuals(metrics);
                const listingUrl = getListingDetailUrl(listing);
                const bedBathSqft = [
                  listing.bedrooms != null ? `${listing.bedrooms} bd` : '— bd',
                  listing.bathrooms != null ? `${listing.bathrooms} ba` : '— ba',
                  listing.livingArea != null ? `${listing.livingArea.toLocaleString()} sqft` : '— sqft',
                ].join(' | ');

                return (
                  <Grid size={{ xs: 12, lg: 6 }} key={zpid}>
                    <Box
                      onClick={() => onRowClick?.(listing)}
                      sx={{
                        borderRadius: 3,
                        border: '1px solid',
                        borderColor: checked ? 'primary.main' : dealColors.border,
                        bgcolor: checked ? 'rgba(37,99,235,0.04)' : 'background.paper',
                        p: 2,
                        cursor: 'pointer',
                        height: '100%',
                        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                        boxShadow: checked
                          ? `0 12px 32px ${alpha(theme.palette.primary.main, 0.35)}`
                          : `0 10px 28px ${dealColors.glow}`,
                        '&:hover': {
                          borderColor: checked ? 'primary.main' : dealColors.hover,
                          boxShadow: checked
                            ? `0 14px 36px ${alpha(theme.palette.primary.main, 0.45)}`
                            : `0 14px 34px ${dealColors.glow}`,
                        },
                      }}
                    >
                      <Stack spacing={1.5}>
                        {imageUrl ? (
                          <Box
                            sx={{
                              borderRadius: 2,
                              overflow: 'hidden',
                              height: 180,
                              backgroundColor: 'grey.100',
                              backgroundImage: `url(${imageUrl})`,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                            }}
                          />
                        ) : null}
                        <Stack direction="row" spacing={1} alignItems="flex-start">
                          <Checkbox
                            checked={checked}
                            onClick={(event) => {
                              event.stopPropagation();
                              onToggle(zpid);
                            }}
                          />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                              {listing.address ?? 'Address unavailable'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" noWrap>
                              {bedBathSqft}
                            </Typography>
                            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" sx={{ mt: 0.5 }}>
                              <Typography variant="subtitle2" color="primary">
                                {listing.price ? `$${listing.price.toLocaleString()}` : 'Price unavailable'}
                              </Typography>
                              {downPaymentAmount != null ? (
                                <Typography variant="body2" color="text.secondary">
                                  Down ${(downPaymentPct * 100).toFixed(1)}% (${downPaymentAmount.toLocaleString()})
                                </Typography>
                              ) : null}
                              {typeof listing.daysOnZillow === 'number' ? (
                                <Typography variant="body2" color="text.secondary">
                                  {listing.daysOnZillow} days listed
                                </Typography>
                              ) : null}
                            </Stack>
                          </Box>
                          {listingUrl ? (
                            <Tooltip title="View on Zillow">
                              <IconButton
                                color="warning"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  window.open(listingUrl, '_blank', 'noopener,noreferrer');
                                }}
                              >
                                <OpenInNewIcon />
                              </IconButton>
                            </Tooltip>
                          ) : null}
                        </Stack>
                        {pipelineRow ? (
                          <Box
                            sx={{
                              borderRadius: 2,
                              bgcolor: dealColors.badgeBg,
                              color: dealColors.badgeText,
                              px: 1.5,
                              py: 1,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 1,
                              flexWrap: 'wrap',
                            }}
                          >
                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                              {dealColors.label}
                            </Typography>
                            <Divider
                              orientation="vertical"
                              flexItem
                              sx={{ borderColor: alpha(dealColors.badgeText, 0.35) }}
                            />
                            <Typography variant="caption">DSCR {dscrLabel ?? '—'}</Typography>
                            <Divider orientation="vertical" flexItem sx={{ borderColor: alpha(dealColors.badgeText, 0.2) }} />
                            <Typography variant="caption">CoC {cocLabel ?? '—'}</Typography>
                            <Divider orientation="vertical" flexItem sx={{ borderColor: alpha(dealColors.badgeText, 0.2) }} />
                            <Typography variant="caption">Cap {capLabel ?? '—'}</Typography>
                            <Divider orientation="vertical" flexItem sx={{ borderColor: alpha(dealColors.badgeText, 0.2) }} />
                            <Typography variant="caption">
                              {pipelineRow.stage === 'final' ? 'Final pass' : 'Coarse pass'}
                            </Typography>
                          </Box>
                        ) : pipelineLoading ? (
                          <Typography variant="caption" color="text.secondary">
                            Scoring in progress…
                          </Typography>
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            Pipeline metrics not available yet.
                          </Typography>
                        )}
                        {/* {pipelineRow ? (
                          <Typography variant="caption" color="text.secondary">
                            {pipelineRow.detail_fetched ? 'Detail fetched' : 'Detail not fetched'}
                          </Typography>
                        ) : null} */}
                        {listing.rentZestimate ? (
                          <Chip
                            label={`Rent estimate $${listing.rentZestimate.toLocaleString()}`}
                            size="small"
                            variant="outlined"
                          />
                        ) : null}
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ pt: 1 }}>
                          <Button
                            fullWidth
                            variant="contained"
                            startIcon={<ChatBubbleOutlineIcon />}
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenChat(listing);
                            }}
                          >
                            Agent Chat
                          </Button>
                          <Button
                            fullWidth
                            variant="outlined"
                            startIcon={<ChangeCircleIcon />}
                            disabled={!pipelineRow || finalizingId === pipelineRow?.zpid}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (pipelineRow) {
                                onFinalize(pipelineRow);
                              }
                            }}
                          >
                            {finalizingId === pipelineRow?.zpid ? 'Finalizing…' : 'Finalize'}
                          </Button>
                        </Stack>
                      </Stack>
                    </Box>
                  </Grid>
                );
              })}
            </Grid>
          )}
          {allSelected && results.length > 0 ? (
            <Typography variant="caption" color="success.main" sx={{ display: 'block', mt: 1 }}>
              All results selected
            </Typography>
          ) : null}
        </Box>
      ) : (
        <Box
          sx={{
            mt: 3,
            height: { xs: 420, md: 520 },
            borderRadius: 3,
            overflow: 'hidden',
            border: '1px solid',
            borderColor: 'divider',
          }}
          aria-busy={pipelineLoading ? 'true' : undefined}
        >
          {pipelineLoading ? (
            <Stack alignItems="center" justifyContent="center" sx={{ height: '100%', p: 3 }} spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Pipeline is running. Map view becomes available once scoring finishes.
              </Typography>
              <Skeleton variant="rectangular" width="100%" height="100%" sx={{ borderRadius: 2 }} />
            </Stack>
          ) : listingsWithCoords.length === 0 ? (
            <Stack alignItems="center" justifyContent="center" sx={{ height: '100%' }}>
              <Typography color="text.secondary">
                No latitude/longitude data available for these listings.
              </Typography>
            </Stack>
          ) : (
            <Suspense
              fallback={
                <Stack alignItems="center" justifyContent="center" sx={{ height: '100%' }}>
                  <Typography color="text.secondary">Loading map…</Typography>
                </Stack>
              }
            >
              <MapResultsView
                listings={listingsWithCoords}
                selected={selected}
                pipelineRowsByZpid={pipelineRowsByZpid}
                onMarkerClick={(listing) => onRowClick?.(listing)}
              />
            </Suspense>
          )}
        </Box>
      )}
    </Paper>
  );
};

export default PropertyResults;
