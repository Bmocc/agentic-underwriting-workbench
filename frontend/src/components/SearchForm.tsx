import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Box,
  Button,
  Chip,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import SearchIcon from '@mui/icons-material/Search';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import BedOutlinedIcon from '@mui/icons-material/BedOutlined';
import BathtubOutlinedIcon from '@mui/icons-material/BathtubOutlined';
import type { PropertySearchPayload } from '../api/types';
import { useEffect, useMemo } from 'react';

interface SearchFormProps {
  defaultValues: PropertySearchPayload;
  onSubmit: (values: PropertySearchPayload) => void;
  isLoading?: boolean;
  onResetFilters?: () => void;
}

const statusOptions = ['ForSale', 'ForRent', 'RecentlySold'] as const;
const homeTypeOptions = ['Multi-family', 'SingleFamily', 'Townhouse', 'Condo'] as const;

const searchFormSchema = z
  .object({
    location: z.string().min(1, 'Location is required'),
    status_type: z.string().optional(),
    home_type: z.string().optional(),
    min_price: z.number().nullable().optional(),
    max_price: z.number().nullable().optional(),
    beds_min: z.number().nullable().optional(),
    baths_min: z.number().nullable().optional(),
    limit: z.number().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.min_price != null &&
      data.max_price != null &&
      !Number.isNaN(data.min_price) &&
      !Number.isNaN(data.max_price) &&
      data.max_price < data.min_price
    ) {
      ctx.addIssue({
        path: ['max_price'],
        code: z.ZodIssueCode.custom,
        message: 'Max price must be greater than or equal to min price.',
      });
    }
    if (data.limit != null) {
      if (data.limit < 1 || data.limit > 100) {
        ctx.addIssue({
          path: ['limit'],
          code: z.ZodIssueCode.custom,
          message: 'Limit must be between 1 and 100.',
        });
      }
    }
    if (data.status_type && !statusOptions.includes(data.status_type as (typeof statusOptions)[number])) {
      ctx.addIssue({
        path: ['status_type'],
        code: z.ZodIssueCode.custom,
        message: 'Unsupported status value',
      });
    }
    if (data.home_type && !homeTypeOptions.includes(data.home_type as (typeof homeTypeOptions)[number])) {
      ctx.addIssue({
        path: ['home_type'],
        code: z.ZodIssueCode.custom,
        message: 'Unsupported home type',
      });
    }
  });

type SearchFormValues = z.infer<typeof searchFormSchema>;

const SearchForm = ({ defaultValues, onSubmit, isLoading, onResetFilters }: SearchFormProps) => {
  const { control, handleSubmit, reset } = useForm<SearchFormValues>({
    defaultValues: defaultValues as SearchFormValues,
    resolver: zodResolver(searchFormSchema) as any,
    mode: 'onBlur',
  });
  const quickTags = useMemo(
    () =>
      [
        defaultValues.location ? `Focus: ${defaultValues.location}` : null,
        defaultValues.home_type ? `Asset: ${defaultValues.home_type}` : null,
        defaultValues.status_type ? `Status: ${defaultValues.status_type}` : null,
        defaultValues.max_price ? `≤ $${defaultValues.max_price.toLocaleString()}` : null,
      ].filter(Boolean),
    [defaultValues.home_type, defaultValues.location, defaultValues.max_price, defaultValues.status_type]
  );

  useEffect(() => {
    reset(defaultValues as SearchFormValues);
  }, [defaultValues, reset]);

  const handleReset = () => {
    reset(defaultValues as SearchFormValues);
    onResetFilters?.();
  };

  return (
    <Paper
      component="form"
      onSubmit={handleSubmit((values) => onSubmit(values))}
      sx={{ p: { xs: 2.5, md: 3 }, background: 'linear-gradient(135deg, #ffffff, rgba(96,165,250,0.08))' }}
      elevation={4}
    >
      <Stack spacing={2.5}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
          <Box>
            <Typography variant="overline" color="primary">
              Search inputs
            </Typography>
            <Typography variant="h6">Dial in a market snapshot</Typography>
            <Typography variant="body2" color="text.secondary">
              Adjust geography and guardrails to pull the right tranche of listings for underwriting.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {quickTags.map((tag) => (
              <Chip key={tag} label={tag} size="small" />
            ))}
          </Stack>
        </Stack>
        <Grid container spacing={2.2}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Controller
              name="location"
              control={control}
              rules={{ required: 'Location is required' }}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Location"
                  placeholder="e.g. Hartford, CT"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  fullWidth
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LocationOnOutlinedIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Controller
              name="status_type"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Status"
                  select
                  fullWidth
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                >
                  {statusOptions.map((option) => (
                    <MenuItem key={option} value={option}>
                      {option}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Controller
              name="home_type"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Home Type"
                  select
                  fullWidth
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                >
                  {homeTypeOptions.map((option) => (
                    <MenuItem key={option} value={option}>
                      {option}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <Controller
              name="min_price"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Min Price"
                  type="number"
                  fullWidth
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <AttachMoneyIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                  onChange={(event) => field.onChange(event.target.value === '' ? null : Number(event.target.value))}
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <Controller
              name="max_price"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Max Price"
                  type="number"
                  fullWidth
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <AttachMoneyIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                  onChange={(event) => field.onChange(event.target.value === '' ? null : Number(event.target.value))}
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <Controller
              name="beds_min"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Min Beds"
                  type="number"
                  fullWidth
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <BedOutlinedIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                  onChange={(event) => field.onChange(event.target.value === '' ? null : Number(event.target.value))}
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <Controller
              name="baths_min"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Min Baths"
                  type="number"
                  fullWidth
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <BathtubOutlinedIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                  onChange={(event) => field.onChange(event.target.value === '' ? null : Number(event.target.value))}
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <Controller
              name="limit"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Result Limit"
                  type="number"
                  fullWidth
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message ?? 'Between 1 and 100'}
                  InputProps={{ inputProps: { min: 1, max: 100 } }}
                  onChange={(event) => field.onChange(event.target.value === '' ? null : Number(event.target.value))}
                />
              )}
            />
          </Grid>
        </Grid>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          justifyContent="flex-end"
          alignItems={{ xs: 'stretch', sm: 'center' }}
        >
          <Button variant="outlined" onClick={handleReset} sx={{ width: { xs: '100%', sm: 'auto' } }}>
            Reset
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isLoading}
            startIcon={<SearchIcon />}
            size="large"
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            {isLoading ? 'Searching…' : 'Search'}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
};

export default SearchForm;
