import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  LinearProgress,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
} from '@mui/material';
import { api } from '../api.js';
import { formatMoney, formatUsd, fullName } from '../format.js';
import { useDebounce } from '../hooks.js';
import EmployeeDialog from './EmployeeDialog.jsx';

const COLUMNS = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'country', label: 'Country', sortable: true },
  { key: 'department', label: 'Department', sortable: true },
  { key: 'jobTitle', label: 'Job title', sortable: true },
  { key: 'salaryUsd', label: 'Salary', sortable: true, align: 'right' },
  { key: 'hireDate', label: 'Hired', sortable: true },
];

const EMPTY_FILTERS = { q: '', country: '', department: '', jobTitle: '' };

function FilterSelect({ label, value, options, onChange }) {
  return (
    <TextField select size="small" label={label} value={value} onChange={(e) => onChange(e.target.value)} sx={{ minWidth: 170 }}>
      <MenuItem value="">All</MenuItem>
      {options.map((o) => (
        <MenuItem key={o.value} value={o.value}>
          {o.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

export default function EmployeeTable({ meta, onChanged }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState({ sortBy: 'name', order: 'asc' });
  const [paging, setPaging] = useState({ page: 0, pageSize: 25 });
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null = closed, {} = new employee, employee = edit
  const [toast, setToast] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const q = useDebounce(filters.q, 300);

  useEffect(() => {
    let cancelled = false; // ignore responses from superseded requests
    setLoading(true);
    api
      .listEmployees({
        q,
        country: filters.country,
        department: filters.department,
        jobTitle: filters.jobTitle,
        sortBy: sort.sortBy,
        order: sort.order,
        page: paging.page + 1,
        pageSize: paging.pageSize,
      })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e) => {
        if (!cancelled) setToast({ severity: 'error', message: e.message });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q, filters.country, filters.department, filters.jobTitle, sort, paging, reloadKey]);

  const changeFilter = (key) => (value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPaging((p) => ({ ...p, page: 0 }));
  };

  const toggleSort = (key) => {
    setSort((s) => (s.sortBy === key ? { sortBy: key, order: s.order === 'asc' ? 'desc' : 'asc' } : { sortBy: key, order: 'asc' }));
    setPaging((p) => ({ ...p, page: 0 }));
  };

  const handleSaved = (employee, wasNew) => {
    setEditing(null);
    setToast({ severity: 'success', message: `${fullName(employee)} ${wasNew ? 'added' : 'updated'}` });
    setReloadKey((k) => k + 1);
    onChanged();
  };

  const handleDelete = async (employee) => {
    if (!window.confirm(`Delete ${fullName(employee)}? This cannot be undone.`)) return;
    try {
      await api.deleteEmployee(employee.id);
      setToast({ severity: 'success', message: `${fullName(employee)} deleted` });
      setReloadKey((k) => k + 1);
      onChanged();
    } catch (e) {
      setToast({ severity: 'error', message: e.message });
    }
  };

  const countryName = (code) => meta.countries.find((c) => c.code === code)?.name ?? code;

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} justifyContent="space-between">
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          Employees
          <Typography component="span" color="text.secondary" sx={{ ml: 1 }}>
            {data.total.toLocaleString()} {data.total === 1 ? 'person' : 'people'}
          </Typography>
        </Typography>
        <Button variant="contained" onClick={() => setEditing({})}>
          Add employee
        </Button>
      </Stack>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            size="small"
            label="Search name or email"
            value={filters.q}
            onChange={(e) => changeFilter('q')(e.target.value)}
            sx={{ minWidth: 260 }}
          />
          <FilterSelect
            label="Country"
            value={filters.country}
            options={meta.countries.map((c) => ({ value: c.code, label: c.name }))}
            onChange={changeFilter('country')}
          />
          <FilterSelect
            label="Department"
            value={filters.department}
            options={meta.departments.map((d) => ({ value: d, label: d }))}
            onChange={changeFilter('department')}
          />
          <FilterSelect
            label="Job title"
            value={filters.jobTitle}
            options={meta.jobTitles.map((t) => ({ value: t, label: t }))}
            onChange={changeFilter('jobTitle')}
          />
          <Button onClick={() => { setFilters(EMPTY_FILTERS); setPaging((p) => ({ ...p, page: 0 })); }}>Clear</Button>
        </Stack>
      </Paper>

      <Paper variant="outlined">
        {loading && <LinearProgress />}
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {COLUMNS.map((col) => (
                  <TableCell key={col.key} align={col.align} sortDirection={sort.sortBy === col.key ? sort.order : false}>
                    <TableSortLabel active={sort.sortBy === col.key} direction={sort.sortBy === col.key ? sort.order : 'asc'} onClick={() => toggleSort(col.key)}>
                      {col.label}
                    </TableSortLabel>
                  </TableCell>
                ))}
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.items.map((e) => (
                <TableRow key={e.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{fullName(e)}</Typography>
                    <Typography variant="caption" color="text.secondary">{e.email}</Typography>
                  </TableCell>
                  <TableCell>{countryName(e.country)}</TableCell>
                  <TableCell>{e.department}</TableCell>
                  <TableCell>{e.jobTitle}</TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">{formatMoney(e.salary, e.currency)}</Typography>
                    {e.currency !== 'USD' && (
                      <Typography variant="caption" color="text.secondary">≈ {formatUsd(e.salaryUsd)}</Typography>
                    )}
                  </TableCell>
                  <TableCell>{e.hireDate}</TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => setEditing(e)}>Edit</Button>
                    <Button size="small" color="error" onClick={() => handleDelete(e)}>Delete</Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && data.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={COLUMNS.length + 1}>
                    <Box sx={{ py: 4, textAlign: 'center' }} color="text.secondary">
                      No employees match these filters.
                    </Box>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={data.total}
          page={paging.page}
          rowsPerPage={paging.pageSize}
          rowsPerPageOptions={[10, 25, 50, 100]}
          onPageChange={(_, page) => setPaging((p) => ({ ...p, page }))}
          onRowsPerPageChange={(e) => setPaging({ page: 0, pageSize: Number(e.target.value) })}
        />
      </Paper>

      {editing && <EmployeeDialog employee={editing.id ? editing : null} meta={meta} onClose={() => setEditing(null)} onSaved={handleSaved} />}

      <Snackbar open={Boolean(toast)} autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast ? <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.message}</Alert> : undefined}
      </Snackbar>
    </Stack>
  );
}
