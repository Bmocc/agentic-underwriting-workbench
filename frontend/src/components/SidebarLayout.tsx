import { Drawer, useMediaQuery, useTheme, Box } from '@mui/material';
import type { ReactNode } from 'react';

interface SidebarLayoutProps {
  open: boolean;
  onToggle: () => void;
  sidebar: ReactNode;
  children: ReactNode;
  topOffset?: number;
}

export const SIDEBAR_WIDTH = 320;

const SidebarLayout = ({ open, onToggle, sidebar, children, topOffset = 0 }: SidebarLayoutProps) => {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const offsetPx = `${topOffset}px`;
  const layoutHeight = `calc(100vh - ${offsetPx})`;
  const sidebarPanel = (
    <Box
      sx={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        height: layoutHeight,
        borderRight: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        boxSizing: 'border-box',
        position: 'sticky',
        top: offsetPx,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        sx={{
          height: '100%',
          overflowY: 'auto',
          px: 2,
          pb: 2,
        }}
      >
        {sidebar}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', width: '100%', height: layoutHeight, mt: offsetPx }}>
      {isDesktop ? (
        open ? sidebarPanel : null
      ) : (
        <Drawer
          variant="temporary"
          anchor="left"
          open={open}
          onClose={onToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            width: SIDEBAR_WIDTH,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: SIDEBAR_WIDTH,
              boxSizing: 'border-box',
              mt: offsetPx,
              height: layoutHeight,
            },
          }}
        >
          <Box sx={{ p: 2 }}>{sidebar}</Box>
        </Drawer>
      )}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          height: layoutHeight,
          minHeight: 0,
          boxSizing: 'border-box',
          overflow: 'hidden',
          transition: theme.transitions.create(['margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
        }}
      >
        <Box sx={{ height: '100%', overflowY: 'auto' }}>{children}</Box>
      </Box>
    </Box>
  );
};

export default SidebarLayout;
