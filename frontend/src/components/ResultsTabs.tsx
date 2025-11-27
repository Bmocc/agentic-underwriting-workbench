import { Box, Paper, Tab, Tabs } from '@mui/material';
import type { ReactNode } from 'react';
import type { ResultsTabKey } from '../types/ui';

interface ResultsTabsProps {
  activeTab: ResultsTabKey;
  onTabChange: (tab: ResultsTabKey) => void;
  searchCount: number;
  pipelineCount: number;
  searchContent: ReactNode;
  pipelineContent: ReactNode;
}

const ResultsTabs = ({
  activeTab,
  onTabChange,
  searchCount,
  pipelineCount,
  searchContent,
  pipelineContent,
}: ResultsTabsProps) => (
  <Paper sx={{ p: { xs: 2, md: 3 } }} elevation={3}>
    <Tabs
      value={activeTab}
      onChange={(_, value) => onTabChange(value as ResultsTabKey)}
      textColor="primary"
      indicatorColor="primary"
      variant="fullWidth"
      sx={{ mb: 2 }}
    >
      <Tab label={`Search Results (${searchCount})`} value="search" />
      <Tab label={`Pipeline Results (${pipelineCount})`} value="pipeline" />
    </Tabs>
    <Box sx={{ mt: 1 }}>{activeTab === 'search' ? searchContent : pipelineContent}</Box>
  </Paper>
);

export default ResultsTabs;
