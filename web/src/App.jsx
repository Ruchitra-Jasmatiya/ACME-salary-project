import { useCallback, useEffect, useState } from 'react';
import { Alert, AppBar, Box, CircularProgress, Container, Tab, Tabs, Toolbar, Typography } from '@mui/material';
import { api } from './api.js';
import EmployeeTable from './components/EmployeeTable.jsx';
import InsightsPage from './components/InsightsPage.jsx';

export default function App() {
  const [tab, setTab] = useState('employees');
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);

  // Filter options come from the data itself, so reload them after any edit.
  const loadMeta = useCallback(() => {
    api
      .meta()
      .then(setMeta)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <Typography variant="h6" sx={{ fontWeight: 600, mr: 4 }}>
            ACME Salary Management
          </Typography>
          <Tabs
            value={tab}
            onChange={(_, value) => setTab(value)}
            textColor="inherit"
            TabIndicatorProps={{ sx: { backgroundColor: 'white' } }}
          >
            <Tab value="employees" label="Employees" />
            <Tab value="insights" label="Insights" />
          </Tabs>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 3 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Could not reach the server: {error}
          </Alert>
        )}
        {!meta && !error && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        )}
        {meta && tab === 'employees' && <EmployeeTable meta={meta} onChanged={loadMeta} />}
        {meta && tab === 'insights' && <InsightsPage meta={meta} />}
      </Container>
    </Box>
  );
}
