import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { api } from '../api.js';
import { formatMoney, formatNumber, formatUsd, formatUsdCompact } from '../format.js';

const DIMENSIONS = [
  { value: 'country', label: 'By country' },
  { value: 'department', label: 'By department' },
  { value: 'jobTitle', label: 'By job title' },
];

function StatCard({ label, value, hint }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="h5" sx={{ fontWeight: 600 }}>{value}</Typography>
      {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
    </Paper>
  );
}

function BreakdownTable({ rows, by, meta }) {
  // Bars are scaled to the largest median so countries/roles can be compared at a glance.
  const maxMedian = Math.max(1, ...rows.map((r) => r.median));
  const label = (key) => (by === 'country' ? meta.countries.find((c) => c.code === key)?.name ?? key : key);

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{DIMENSIONS.find((d) => d.value === by).label.replace('By ', '')}</TableCell>
            <TableCell align="right">Headcount</TableCell>
            <TableCell align="right">Total payroll</TableCell>
            <TableCell align="right">Min</TableCell>
            <TableCell sx={{ minWidth: 220 }}>Median</TableCell>
            <TableCell align="right">Average</TableCell>
            <TableCell align="right">Max</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key} hover>
              <TableCell sx={{ fontWeight: 500 }}>{label(r.key)}</TableCell>
              <TableCell align="right">{formatNumber(r.headcount)}</TableCell>
              <TableCell align="right">{formatUsdCompact(r.totalPayroll)}</TableCell>
              <TableCell align="right">{formatUsd(r.min)}</TableCell>
              <TableCell>
                <Typography variant="body2">{formatUsd(r.median)}</Typography>
                <LinearProgress variant="determinate" value={(r.median / maxMedian) * 100} sx={{ height: 6, borderRadius: 3 }} />
              </TableCell>
              <TableCell align="right">{formatUsd(r.average)}</TableCell>
              <TableCell align="right">{formatUsd(r.max)}</TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7}><Box sx={{ py: 3, textAlign: 'center' }} color="text.secondary">No data for this selection.</Box></TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function OutliersTable({ rows, meta }) {
  const countryName = (code) => meta.countries.find((c) => c.code === code)?.name ?? code;
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Employee</TableCell>
            <TableCell>Job title</TableCell>
            <TableCell>Country</TableCell>
            <TableCell align="right">Salary</TableCell>
            <TableCell align="right">Peer median (USD)</TableCell>
            <TableCell align="right">vs peers</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((o) => (
            <TableRow key={o.id} hover>
              <TableCell sx={{ fontWeight: 500 }}>{o.name}</TableCell>
              <TableCell>{o.jobTitle}</TableCell>
              <TableCell>{countryName(o.country)}</TableCell>
              <TableCell align="right">{formatMoney(o.salary, o.currency)}</TableCell>
              <TableCell align="right">{formatUsd(o.peerMedianUsd)} <Typography component="span" variant="caption" color="text.secondary">({o.peerCount} peers)</Typography></TableCell>
              <TableCell align="right">
                <Chip size="small" color={o.direction === 'above' ? 'warning' : 'info'} label={`${o.ratio}× ${o.direction === 'above' ? 'above' : 'below'}`} />
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6}><Box sx={{ py: 3, textAlign: 'center' }} color="text.secondary">No outliers found.</Box></TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default function InsightsPage({ meta }) {
  const [filters, setFilters] = useState({ country: '', department: '' });
  const [by, setBy] = useState('country');
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState(null);
  const [outliers, setOutliers] = useState(null);
  const [error, setError] = useState(null);

  // The slice being compared is the dimension itself, so don't filter on it too.
  const effectiveFilters = { ...filters, ...(by === 'country' ? { country: '' } : {}), ...(by === 'department' ? { department: '' } : {}) };

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([api.summary(filters), api.breakdown(by, effectiveFilters)])
      .then(([s, b]) => {
        if (cancelled) return;
        setSummary(s);
        setRows(b);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.country, filters.department, by]);

  useEffect(() => {
    api.outliers(25).then(setOutliers).catch((e) => setError(e.message));
  }, []);

  return (
    <Stack spacing={3}>
      <Typography variant="h5" sx={{ fontWeight: 600 }}>How we pay people</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: '-16px !important' }}>
        All figures are converted to USD using fixed reference rates so countries are comparable.
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
          <Typography variant="subtitle2">Focus on</Typography>
          <TextField select size="small" label="Country" value={filters.country} onChange={(e) => setFilters((f) => ({ ...f, country: e.target.value }))} sx={{ minWidth: 180 }}>
            <MenuItem value="">All countries</MenuItem>
            {meta.countries.map((c) => <MenuItem key={c.code} value={c.code}>{c.name}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Department" value={filters.department} onChange={(e) => setFilters((f) => ({ ...f, department: e.target.value }))} sx={{ minWidth: 180 }}>
            <MenuItem value="">All departments</MenuItem>
            {meta.departments.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
          </TextField>
        </Stack>
      </Paper>

      {!summary ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' }, gap: 2 }}>
          <StatCard label="Headcount" value={formatNumber(summary.headcount)} />
          <StatCard label="Total payroll" value={formatUsdCompact(summary.totalPayroll)} hint="annual, USD" />
          <StatCard label="Median salary" value={formatUsd(summary.median)} />
          <StatCard label="Average salary" value={formatUsd(summary.average)} />
          <StatCard label="Range" value={`${formatUsdCompact(summary.min)} – ${formatUsdCompact(summary.max)}`} hint="min – max" />
        </Box>
      )}

      <Paper variant="outlined">
        <Tabs value={by} onChange={(_, v) => setBy(v)} sx={{ borderBottom: 1, borderColor: 'divider', px: 1 }}>
          {DIMENSIONS.map((d) => <Tab key={d.value} value={d.value} label={d.label} />)}
        </Tabs>
        {rows ? <BreakdownTable rows={rows} by={by} meta={meta} /> : <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress size={24} /></Box>}
      </Paper>

      <Paper variant="outlined">
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>Pay outliers</Typography>
          <Typography variant="body2" color="text.secondary">
            People paid at least 1.5× or at most 0.67× the median of peers with the same job title in the same country.
            Worth a look for equity — or for data-entry mistakes.
          </Typography>
        </Box>
        {outliers ? <OutliersTable rows={outliers} meta={meta} /> : <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress size={24} /></Box>}
      </Paper>
    </Stack>
  );
}
