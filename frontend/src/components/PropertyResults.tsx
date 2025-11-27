import {
  Box,
  Button,
  Checkbox,
  Chip,
  InputAdornment,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import BedOutlinedIcon from '@mui/icons-material/BedOutlined';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Grid from '@mui/material/Grid';
import type { PipelineRow, PropertyListing } from '../api/types';
import { lazy, Suspense, useMemo, useState } from 'react';
import type { ResultFilters } from '../types/ui';

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
  const allSelected = results.length > 0 && selected.size === results.length;
  const hasFilters = useMemo(() => Boolean(filters.query || filters.minBeds || filters.maxPrice), [filters]);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const listingsWithCoords = useMemo(
    () =>
      results.filter((listing) => {
        const lat = (listing as Record<string, unknown>).latitude;
        const lng = (listing as Record<string, unknown>).longitude;
        return typeof lat === 'number' && typeof lng === 'number';
      }),
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
                const isFinalizing = finalizingId === pipelineRow?.zpid;
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
                const detailPath = typeof media.detailUrl === 'string' ? media.detailUrl : null;
                const listingUrl = detailPath ? `https://www.zillow.com${detailPath}` : null;
                return (
                  <Grid size={{ xs: 12, lg: 6 }} key={zpid}>
                    <Box
                      onClick={() => onRowClick?.(listing)}
                      sx={{
                        borderRadius: 3,
                        border: '1px solid',
                        borderColor: checked ? 'primary.main' : 'divider',
                        bgcolor: checked ? 'rgba(37,99,235,0.04)' : 'background.paper',
                        p: 2,
                        cursor: 'pointer',
                        height: '100%',
                        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                        boxShadow: checked ? '0 10px 30px rgba(37, 99, 235, 0.15)' : 'none',
                        '&:hover': {
                          borderColor: 'primary.main',
                          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.12)',
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
                          <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                              {listing.address ?? 'Address unavailable'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              ZPID: {zpid}
                            </Typography>
                          </Box>
                          <Box sx={{ flexGrow: 1 }} />
                                  <Stack direction="row" spacing={1} flexWrap="wrap">
                                    <Button
                                      size="small"
                                      variant="contained"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        onOpenChat(listing);
                                      }}
                                    >
                                      Chat Agent
                                    </Button>
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      disabled={!pipelineRow || isFinalizing}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (pipelineRow) {
                                          onFinalize(pipelineRow);
                                        }
                                      }}
                                    >
                                      {isFinalizing ? 'Finalizing…' : 'Finalize'}
                                    </Button>
                                    {listingUrl ? (
                                      <Button
                                        size="small"
                                        variant="text"
                                        color="secondary"
                                        startIcon={<OpenInNewIcon fontSize="small" />}
                                        component="a"
                                        href={listingUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(event) => event.stopPropagation()}
                                        sx={{ ml: { xs: 0, sm: 'auto' } }}
                                      >
                                        Zillow Listing
                                      </Button>
                                    ) : null}
                                  </Stack>
                                </Stack>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Chip
                            label={`$${listing.price?.toLocaleString() ?? 'N/A'}`}
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                          {listing.rentZestimate ? (
                            <Chip
                              label={`Rent $${listing.rentZestimate.toLocaleString()}`}
                              size="small"
                              variant="outlined"
                            />
                          ) : null}
                          {downPaymentAmount != null ? (
                            <Chip
                              label={`Down $${downPaymentAmount.toLocaleString()} (${(downPaymentPct * 100).toFixed(1)}%)`}
                              size="small"
                              variant="outlined"
                              color="success"
                            />
                          ) : null}
                          {typeof listing.daysOnZillow === 'number' ? (
                            <Chip
                              label={`${listing.daysOnZillow} days listed`}
                              size="small"
                              variant="outlined"
                              color="secondary"
                            />
                          ) : null}
                        </Stack>
                        {pipelineRow ? (
                          <Stack direction="row" spacing={1} flexWrap="wrap">
                            <Chip
                              label={pipelineRow.stage === 'final' ? 'Final pass' : 'Coarse pass'}
                              size="small"
                              color={pipelineRow.stage === 'final' ? 'success' : 'default'}
                            />
                            {dscrLabel ? <Chip label={`DSCR ${dscrLabel}`} size="small" /> : null}
                            {cocLabel ? <Chip label={`CoC ${cocLabel}`} size="small" /> : null}
                            {capLabel ? <Chip label={`Cap ${capLabel}`} size="small" /> : null}
                            {pipelineRow.detail_fetched ? (
                              <Chip label="Detail fetched" size="small" color="success" variant="outlined" />
                            ) : null}
                          </Stack>
                        ) : pipelineLoading ? (
                          <Typography variant="caption" color="text.secondary">
                            Scoring in progress…
                          </Typography>
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            Pipeline metrics not available yet.
                          </Typography>
                        )}
                        <Stack direction="row" spacing={2} flexWrap="wrap">
                          <Typography variant="caption">Beds: {listing.bedrooms ?? '—'}</Typography>
                          <Typography variant="caption">Baths: {listing.bathrooms ?? '—'}</Typography>
                          <Typography variant="caption">
                            SqFt: {listing.livingArea?.toLocaleString() ?? '—'}
                          </Typography>
                          {typeof listing.unitsCount === 'number' ? (
                            <Typography variant="caption">Units: {listing.unitsCount}</Typography>
                          ) : null}
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
