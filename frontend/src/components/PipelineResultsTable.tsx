import { useMemo, useState } from 'react';
import AssessmentIcon from '@mui/icons-material/Assessment';
import {
  Box,
  Button,
  Chip,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Tooltip,
  Typography,
} from '@mui/material';
import type { PipelineRow } from '../api/types';

interface PipelineResultsTableProps {
  rows: PipelineRow[];
  onRunAgent: (row: PipelineRow) => void;
  onFetchFinal: (row: PipelineRow) => void;
  onSelectRow: (row: PipelineRow) => void;
  agentLoadingId?: string | null;
  finalizingId?: string | null;
  isLoading?: boolean;
}

const metricValue = (row: PipelineRow, key: string) => {
  const metrics = (row.final_metrics as Record<string, number>) || (row.coarse_metrics as Record<string, number>);
  const value = metrics?.[key];
  if (value === undefined || value === null) {
    return '—';
  }
  if (['cap_rate', 'cash_on_cash'].includes(key)) {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (key === 'dscr') {
    return value.toFixed(2);
  }
  return value.toFixed(2);
};

const stageColor = (stage?: string): 'default' | 'success' | 'info' | 'warning' => {
  if (stage === 'final') {
    return 'success';
  }
  if (stage === 'detail') {
    return 'info';
  }
  if (stage === 'error') {
    return 'warning';
  }
  return 'default';
};

const downPaymentValue = (row: PipelineRow) => {
  const inputs = (row.final_inputs ?? row.coarse_inputs) as Record<string, any> | undefined;
  const pct = typeof inputs?.down_payment_pct === 'number' ? inputs.down_payment_pct : null;
  const price = row.price ?? (typeof inputs?.purchase_price === 'number' ? inputs.purchase_price : null);
  if (pct == null || price == null) {
    return '—';
  }
  const amount = price * pct;
  return `$${amount.toLocaleString()} (${(pct * 100).toFixed(1)}%)`;
};

const PipelineResultsTable = ({
  rows,
  onRunAgent,
  onFetchFinal,
  onSelectRow,
  agentLoadingId,
  finalizingId,
  isLoading = false,
}: PipelineResultsTableProps) => {
  const [orderBy, setOrderBy] = useState<'dscr' | 'cash_on_cash' | 'cap_rate'>('dscr');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  const handleSort = (column: 'dscr' | 'cash_on_cash' | 'cap_rate') => {
    if (orderBy === column) {
      setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrderBy(column);
      setOrder('desc');
    }
  };

  const sortedRows = useMemo(() => {
    const dataset = [...rows];
    dataset.sort((a, b) => {
      const metricsA = (a.final_metrics ?? a.coarse_metrics) as Record<string, number> | undefined;
      const metricsB = (b.final_metrics ?? b.coarse_metrics) as Record<string, number> | undefined;
      const valueA = metricsA?.[orderBy] ?? 0;
      const valueB = metricsB?.[orderBy] ?? 0;
      return order === 'desc' ? valueB - valueA : valueA - valueB;
    });
    return dataset;
  }, [rows, orderBy, order]);

  const renderSkeletonRows = () =>
    Array.from({ length: 4 }).map((_, idx) => (
      <TableRow key={`skeleton-${idx}`}>
        {Array.from({ length: 8 }).map((__, cellIdx) => (
          <TableCell key={`cell-${cellIdx}`}>
            <Skeleton variant="rectangular" height={20} />
          </TableCell>
        ))}
      </TableRow>
    ));

  const riskShade = (row: PipelineRow) => {
    const metrics = (row.final_metrics ?? row.coarse_metrics) as Record<string, number> | undefined;
    const dscr = metrics?.dscr ?? 0;
    if (dscr < 1) {
      return 'rgba(248,113,113,0.12)';
    }
    if (dscr < 1.2) {
      return 'rgba(250,204,21,0.12)';
    }
    return undefined;
  };

  return (
    <Paper sx={{ p: 3 }} elevation={4}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', md: 'center' }}
        sx={{ mb: 2 }}
        spacing={1.5}
      >
        <Typography variant="h6">Underwriting Pipeline</Typography>
        <Typography variant="body2" color="text.secondary">
          {rows.length ? `${rows.length} deals scored` : 'Run the pipeline to score your search results'}
        </Typography>
      </Stack>
      <TableContainer sx={{ maxHeight: 520 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ '& th': { textTransform: 'uppercase', fontSize: 12, color: 'text.secondary' } }}>
              <TableCell>Address</TableCell>
              <TableCell>Stage</TableCell>
              <TableCell align="right">Down Pmt</TableCell>
              <TableCell align="right">
                <TableSortLabel active={orderBy === 'dscr'} direction={order} onClick={() => handleSort('dscr')}>
                  DSCR
                </TableSortLabel>
              </TableCell>
              <TableCell align="right">
                <TableSortLabel
                  active={orderBy === 'cash_on_cash'}
                  direction={order}
                  onClick={() => handleSort('cash_on_cash')}
                >
                  CoC
                </TableSortLabel>
              </TableCell>
              <TableCell align="right">
                <TableSortLabel active={orderBy === 'cap_rate'} direction={order} onClick={() => handleSort('cap_rate')}>
                  Cap
                </TableSortLabel>
              </TableCell>
              <TableCell align="center">Detail</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              renderSkeletonRows()
            ) : sortedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <Box sx={{ py: 4, textAlign: 'center' }}>
                    <Typography color="text.secondary">
                      No pipeline results yet. Run a batch to see underwriting metrics.
                    </Typography>
                  </Box>
                </TableCell>
              </TableRow>
            ) : (
              sortedRows.map((row) => (
                <TableRow
                  key={row.zpid}
                  hover
                  onClick={() => onSelectRow(row)}
                  sx={{
                    cursor: 'pointer',
                    '& td': { borderBottomColor: 'rgba(15,23,42,0.05)' },
                    '&:hover': { backgroundColor: 'rgba(59,130,246,0.06)' },
                    backgroundColor: riskShade(row),
                  }}
                >
                  <TableCell>
                    <Stack spacing={0.5}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        {row.address || 'Address unavailable'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        ZPID: {row.zpid} · {'$' + (row.price?.toLocaleString() ?? 'N/A')}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={row.stage || 'pending'}
                      size="small"
                      color={stageColor(row.stage)}
                      variant={row.stage === 'final' ? 'filled' : 'outlined'}
                    />
                  </TableCell>
                  <TableCell align="right">{downPaymentValue(row)}</TableCell>
                  <TableCell align="right">{metricValue(row, 'dscr')}</TableCell>
                  <TableCell align="right">{metricValue(row, 'cash_on_cash')}</TableCell>
                  <TableCell align="right">{metricValue(row, 'cap_rate')}</TableCell>
                  <TableCell align="center">
                    {row.detail_fetched ? (
                      <Chip label="Fetched" size="small" color="success" />
                    ) : row.detail_error ? (
                      <Tooltip title={row.detail_error}>
                        <Chip label="Error" size="small" color="warning" />
                      </Tooltip>
                    ) : (
                      <Chip label="Pending" size="small" />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Tooltip title="Run agent with current inputs">
                        <span>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<AssessmentIcon fontSize="small" />}
                            disabled={(!row.coarse_inputs && !row.final_inputs) || agentLoadingId === row.zpid}
                            onClick={(event) => {
                              event.stopPropagation();
                              onRunAgent(row);
                            }}
                          >
                            {agentLoadingId === row.zpid ? 'Running…' : 'Agent'}
                          </Button>
                        </span>
                      </Tooltip>
                      <Button
                        size="small"
                        variant="contained"
                        disabled={finalizingId === row.zpid}
                        onClick={(event) => {
                          event.stopPropagation();
                          onFetchFinal(row);
                        }}
                      >
                        {finalizingId === row.zpid ? 'Finalizing…' : 'Finalize'}
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

export default PipelineResultsTable;
