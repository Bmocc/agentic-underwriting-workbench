import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PipelineRow, PropertyListing } from '../api/types';
import { Box, Stack, Typography, Chip } from '@mui/material';

const redPinSvg = encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='#d32f2f' d='M12 2c-3.3 0-6 2.7-6 6 0 4.5 6 12 6 12s6-7.5 6-12c0-3.3-2.7-6-6-6z'/><circle fill='#fff' cx='12' cy='8.5' r='2.5'/></svg>"
);

const redPinIcon = L.icon({
  iconUrl: `data:image/svg+xml,${redPinSvg}`,
  iconSize: [28, 40],
  iconAnchor: [14, 40],
  popupAnchor: [0, -34],
});

interface FitBoundsProps {
  positions: [number, number][];
}

const FitBounds = ({ positions }: FitBoundsProps) => {
  const map = useMap();
  useEffect(() => {
    if (!positions.length) {
      return;
    }
    const bounds = L.latLngBounds(positions);
    map.fitBounds(bounds, { padding: [32, 32] });
  }, [positions, map]);
  return null;
};

interface MapResultsViewProps {
  listings: PropertyListing[];
  selected: Set<string>;
  onMarkerClick?: (listing: PropertyListing) => void;
  pipelineRowsByZpid: Record<string, PipelineRow>;
}

const MapResultsView = ({ listings, selected, onMarkerClick, pipelineRowsByZpid }: MapResultsViewProps) => {
  const positions = useMemo<[number, number][]>(() => {
    const coords: [number, number][] = [];
    listings.forEach((listing) => {
      const lat = Number((listing as Record<string, unknown>).latitude);
      const lng = Number((listing as Record<string, unknown>).longitude);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        coords.push([lat, lng]);
      }
    });
    return coords;
  }, [listings]);

  const defaultCenter: [number, number] = positions[0] ?? [41.6032, -73.0877];

  return (
    <MapContainer center={defaultCenter} zoom={11} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds positions={positions} />
      {listings.map((listing) => {
        const metadata = listing as Record<string, unknown>;
        const lat = Number(metadata.latitude);
        const lng = Number(metadata.longitude);
        if (Number.isNaN(lat) || Number.isNaN(lng)) {
          return null;
        }
        const imageUrl =
          (metadata as Record<string, any>).imgSrc ??
          (metadata as Record<string, any>).image ??
          (metadata as Record<string, any>).photoUrl ??
          (metadata as Record<string, any>).photo?.url ??
          null;
        const isSelected = selected.has(String(listing.zpid));
        const pipelineRow = pipelineRowsByZpid[String(listing.zpid)];
        const metrics = pipelineRow?.final_metrics ?? pipelineRow?.coarse_metrics;
        return (
          <Marker
            key={listing.zpid}
            position={[lat, lng]}
            icon={redPinIcon}
            eventHandlers={{
              click: () => onMarkerClick?.(listing),
            }}
            opacity={isSelected ? 1 : 0.8}
          >
            <Popup>
              <Typography variant="subtitle2">{listing.address ?? 'Address unavailable'}</Typography>
              <Typography variant="caption">Price: ${listing.price?.toLocaleString() ?? 'N/A'}</Typography>
              {pipelineRow ? (
                <Stack direction="row" spacing={1} sx={{ mt: 0.5 }} flexWrap="wrap">
                  <Chip
                    label={pipelineRow.stage === 'final' ? 'Final pass' : 'Coarse'}
                    size="small"
                    color={pipelineRow.stage === 'final' ? 'success' : 'default'}
                  />
                  {metrics?.dscr ? <Chip label={`DSCR ${metrics.dscr.toFixed(2)}`} size="small" /> : null}
                </Stack>
              ) : null}
              {imageUrl ? (
                <Box component="img" src={imageUrl} alt={listing.address ?? 'Property'} sx={{ width: 180, mt: 1, borderRadius: 1 }} />
              ) : null}
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
};

export default MapResultsView;
