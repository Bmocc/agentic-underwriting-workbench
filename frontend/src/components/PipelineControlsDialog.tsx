import type { Dispatch, SetStateAction } from 'react';
import SettingsSuggestIcon from '@mui/icons-material/SettingsSuggest';
import Grid from '@mui/material/Grid';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import type { AssumptionOverrides, PipelineOptions } from '../api/types';
import AssumptionControls from './AssumptionControls';

interface PipelineControlsDialogProps {
  open: boolean;
  onClose: () => void;
  pipelineOptions: PipelineOptions;
  updatePipelineOptions: Dispatch<SetStateAction<PipelineOptions>>;
  assumptionOverrides: AssumptionOverrides;
  defaultAssumptions: AssumptionOverrides;
  onAssumptionsChange: (value: AssumptionOverrides) => void;
  onResetAssumptions: () => void;
  pipelineLabel: string;
  onPipelineLabelChange: (value: string) => void;
  forceAgentRun: boolean;
  onForceAgentRunChange: (value: boolean) => void;
  forceFinalRun: boolean;
  onForceFinalRunChange: (value: boolean) => void;
  onRunPipeline: () => void;
  isRunning: boolean;
}

const PipelineControlsDialog = ({
  open,
  onClose,
  pipelineOptions,
  updatePipelineOptions,
  assumptionOverrides,
  defaultAssumptions,
  onAssumptionsChange,
  onResetAssumptions,
  pipelineLabel,
  onPipelineLabelChange,
  forceAgentRun,
  onForceAgentRunChange,
  forceFinalRun,
  onForceFinalRunChange,
  onRunPipeline,
  isRunning,
}: PipelineControlsDialogProps) => (
  <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
    <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <SettingsSuggestIcon color="primary" />
      Pipeline Controls
    </DialogTitle>
    <DialogContent dividers>
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          Tune how aggressive the pipeline should be before scoring properties, then apply assumption overrides in one place.
        </Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between">
          <FormControlLabel
            control={
              <Switch
                checked={pipelineOptions.fetch_details_for_promising}
                onChange={(event) =>
                  updatePipelineOptions((prev) => ({ ...prev, fetch_details_for_promising: event.target.checked }))
                }
              />
            }
            label="Fetch details for promising deals"
          />
          <FormControlLabel
            control={
              <Switch
                checked={pipelineOptions.use_agent_for_final}
                onChange={(event) =>
                  updatePipelineOptions((prev) => ({ ...prev, use_agent_for_final: event.target.checked }))
                }
              />
            }
            label="Run agent on final pass"
          />
        </Stack>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="Max detail fetches"
              type="number"
              fullWidth
              value={pipelineOptions.max_detail_fetches}
              onChange={(event) =>
                updatePipelineOptions((prev) => ({
                  ...prev,
                  max_detail_fetches: Number(event.target.value) || 0,
                }))
              }
              InputProps={{ inputProps: { min: 0, max: 50 } }}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="Detail sleep (sec)"
              type="number"
              fullWidth
              value={pipelineOptions.detail_sleep_sec}
              onChange={(event) =>
                updatePipelineOptions((prev) => ({
                  ...prev,
                  detail_sleep_sec: Number(event.target.value) || 0,
                }))
              }
              InputProps={{ inputProps: { step: 0.1 } }}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="Run label"
              value={pipelineLabel}
              onChange={(event) => onPipelineLabelChange(event.target.value)}
              placeholder="Optional nickname"
              fullWidth
            />
          </Grid>
        </Grid>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'flex-start', md: 'center' }}>
          <FormControlLabel
            control={<Switch checked={forceAgentRun} onChange={(event) => onForceAgentRunChange(event.target.checked)} />}
            label="Force agent rerun"
          />
          <FormControlLabel
            control={<Switch checked={forceFinalRun} onChange={(event) => onForceFinalRunChange(event.target.checked)} />}
            label="Force finalize rerun"
          />
        </Stack>
        <Divider />
        <AssumptionControls
          value={assumptionOverrides}
          defaults={defaultAssumptions}
          onChange={onAssumptionsChange}
          onReset={onResetAssumptions}
        />
      </Stack>
    </DialogContent>
    <DialogActions sx={{ justifyContent: 'space-between' }}>
      <Button onClick={onClose}>Close</Button>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button variant="contained" onClick={onRunPipeline} disabled={isRunning}>
          {isRunning ? 'Re-running…' : 'Apply & rerun'}
        </Button>
      </Box>
    </DialogActions>
  </Dialog>
);

export default PipelineControlsDialog;
