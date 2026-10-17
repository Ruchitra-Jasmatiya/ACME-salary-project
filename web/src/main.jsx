import React from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import App from './App.jsx';

const theme = createTheme({
  palette: {
    primary: { main: '#1f4e79' },
    background: { default: '#f5f7fa' },
  },
  shape: { borderRadius: 8 },
  typography: { fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif' },
});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
