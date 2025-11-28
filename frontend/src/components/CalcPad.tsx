import { ButtonBase, Paper, Stack, Typography } from '@mui/material';
import Grid from '@mui/material/Grid';
import { useTheme, alpha } from '@mui/material/styles';
import type { MouseEvent } from 'react';

interface CalcPadProps {
  expression: string;
  result: string;
  onAppend: (token: string) => void;
  onClear: () => void;
  onBackspace: () => void;
  onEvaluate: () => void;
}

const keypad = [
  [
    { label: 'AC', action: 'clear', color: 'action' },
    { label: '⌫', action: 'backspace', color: 'action' },
    { label: '(', token: '(' },
    { label: ')', token: ')' },
  ],
  [
    { label: '7', token: '7' },
    { label: '8', token: '8' },
    { label: '9', token: '9' },
    { label: '÷', token: '/' },
  ],
  [
    { label: '4', token: '4' },
    { label: '5', token: '5' },
    { label: '6', token: '6' },
    { label: '×', token: '*' },
  ],
  [
    { label: '1', token: '1' },
    { label: '2', token: '2' },
    { label: '3', token: '3' },
    { label: '−', token: '-' },
  ],
  [
    { label: '0', token: '0' },
    { label: '.', token: '.' },
    { label: '^', token: '**' },
    { label: '+', token: '+' },
  ],
];

const CalcPad = ({ expression, result, onAppend, onClear, onBackspace, onEvaluate }: CalcPadProps) => {
  const theme = useTheme();

  const handleClick = (event: MouseEvent, config: (typeof keypad)[number][number]) => {
    event.preventDefault();
    if (config.action === 'clear') {
      onClear();
      return;
    }
    if (config.action === 'backspace') {
      onBackspace();
      return;
    }
    if (config.token) {
      onAppend(config.token);
    }
  };

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 3,
        bgcolor: theme.palette.grey[50],
        p: 2,
        boxShadow: '0 10px 30px rgba(15,23,42,0.08)',
      }}
    >
      <Stack
        spacing={0.5}
        sx={{
          bgcolor: 'common.white',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          p: 1.5,
          mb: 2,
          boxShadow: 'inset 0 1px 2px rgba(15,23,42,0.08)',
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Expression
        </Typography>
        <Typography variant="h6" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
          {expression || '0'}
        </Typography>
        {result ? (
          <Typography variant="body2" color="success.main">
            = {result}
          </Typography>
        ) : null}
      </Stack>
      <Grid container spacing={1}>
        {keypad.flat().map((config) => (
          <Grid size={{ xs: 3 }} key={`${config.label}-${config.token ?? config.action}`}>
            <ButtonBase
              onClick={(event) => handleClick(event, config)}
              sx={{
                width: '100%',
                borderRadius: 2,
                py: 1.2,
                fontWeight: 700,
                fontSize: 16,
                bgcolor:
                  config.color === 'action'
                    ? alpha(theme.palette.error.main, 0.08)
                    : config.token && /[\+\-\*\/]/.test(config.token)
                      ? alpha(theme.palette.primary.main, 0.12)
                      : 'common.white',
                color:
                  config.color === 'action'
                    ? theme.palette.error.main
                    : config.token && /[\+\-\*\/]/.test(config.token)
                      ? theme.palette.primary.main
                      : theme.palette.text.primary,
                boxShadow: '0 3px 10px rgba(15,23,42,0.12)',
              }}
            >
              {config.label}
            </ButtonBase>
          </Grid>
        ))}
      </Grid>
      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        <ButtonBase
          onClick={(event) => {
            event.preventDefault();
            onClear();
          }}
          sx={{
            flex: 1,
            borderRadius: 2,
            bgcolor: 'common.white',
            py: 1.2,
            fontWeight: 600,
            boxShadow: '0 3px 10px rgba(15,23,42,0.12)',
          }}
        >
          Clear
        </ButtonBase>
        <ButtonBase
          onClick={(event) => {
            event.preventDefault();
            onEvaluate();
          }}
          sx={{
            flex: 1,
            borderRadius: 2,
            py: 1.2,
            fontWeight: 700,
            color: 'common.white',
            background: 'linear-gradient(135deg, #1d4ed8, #4338ca)',
            boxShadow: '0 10px 25px rgba(67,56,202,0.35)',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            transition: 'opacity 0.15s ease',
            '&:hover': {
              opacity: 0.9,
            },
          }}
        >
          Evaluate
        </ButtonBase>
      </Stack>
    </Paper>
  );
};

export default CalcPad;
