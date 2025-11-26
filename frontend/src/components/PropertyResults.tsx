import { Box, Button, Checkbox, Chip, InputAdornment, Paper, Stack, TextField, Typography, ToggleButtonGroup, ToggleButton } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import BedOutlinedIcon from '@mui/icons-material/BedOutlined';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import Grid from '@mui/material/Grid';
import type { PropertyListing } from '../api/types';
import { useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export interface ResultFilters {
  query: string;
  minBeds?: number | null;
  maxPrice?: number | null;
}

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
  const mapCenter = useMemo<[number, number]>(() => {
    if (listingsWithCoords.length > 0) {
      const first = listingsWithCoords[0] as Record<string, unknown>;
      return [Number(first.latitude), Number(first.longitude)];
    }
    return [41.6032, -73.0877]; // default to CT center
  }, [listingsWithCoords]);

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
          <Button variant="outlined" onClick={() => onFiltersChange({ query: '', minBeds: null, maxPrice: null })} sx={{ minWidth: 140 }}>
            Clear filters
          </Button>
        </Stack>
      </Stack>
      {viewMode === 'list' ? (
        <Box
          sx={{
            mt: 3,
            maxHeight: { xs: 460, md: 520 },
            overflowY: 'auto',
            pr: 1,
          }}
        >
          {results.length === 0 ? (
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
                const downPaymentAmount =
                  typeof listing.price === 'number' ? listing.price * downPaymentPct : null;
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
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={(event) => {
                              event.stopPropagation();
                              onRowClick?.(listing);
                            }}
                          >
                            Inspect
                          </Button>
                        </Stack>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Chip
                            label={`$${listing.price?.toLocaleString() ?? 'N/A'}`}
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                          {listing.rentZestimate ? (
                            <Chip label={`Rent $${listing.rentZestimate.toLocaleString()}`} size="small" variant="outlined" />
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
                            <Chip label={`${listing.daysOnZillow} days listed`} size="small" variant="outlined" color="secondary" />
                          ) : null}
                        </Stack>
                        <Stack direction="row" spacing={2} flexWrap="wrap">
                          <Typography variant="caption">Beds: {listing.bedrooms ?? '—'}</Typography>
                          <Typography variant="caption">Baths: {listing.bathrooms ?? '—'}</Typography>
                          <Typography variant="caption">SqFt: {listing.livingArea?.toLocaleString() ?? '—'}</Typography>
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
        <Box sx={{ mt: 3, height: { xs: 420, md: 520 }, borderRadius: 3, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
          {listingsWithCoords.length === 0 ? (
            <Stack alignItems="center" justifyContent="center" sx={{ height: '100%' }}>
              <Typography color="text.secondary">No latitude/longitude data available for these listings.</Typography>
            </Stack>
          ) : (
            <MapContainer center={mapCenter} zoom={11} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {listingsWithCoords.map((listing) => {
                const metadata = listing as Record<string, unknown>;
                const lat = Number(metadata.latitude);
                const lng = Number(metadata.longitude);
                const imageUrl =
                  (metadata as Record<string, any>).imgSrc ??
                  (metadata as Record<string, any>).image ??
                  (metadata as Record<string, any>).photoUrl ??
                  (metadata as Record<string, any>).photo?.url ??
                  null;
                return (
                  <Marker key={listing.zpid} position={[lat, lng]}>
                    <Popup>
                      <Typography variant="subtitle2">{listing.address ?? 'Address unavailable'}</Typography>
                      <Typography variant="caption">Price: ${listing.price?.toLocaleString() ?? 'N/A'}</Typography>
                      {imageUrl ? (
                        <Box
                          component="img"
                          src={imageUrl}
                          alt={listing.address ?? 'Property'}
                          sx={{ width: 180, mt: 1, borderRadius: 1 }}
                        />
                      ) : null}
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          )}
        </Box>
      )}
    </Paper>
  );
};

export default PropertyResults;
