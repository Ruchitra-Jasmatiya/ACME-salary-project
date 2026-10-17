import { useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField } from '@mui/material';
import { api } from '../api.js';
import { toFormState, toPayload } from '../format.js';

/** Create (employee = null) or edit an employee. Server-side validation errors are shown per field. */
export default function EmployeeDialog({ employee, meta, onClose, onSaved }) {
  const isNew = employee === null;
  const [form, setForm] = useState(() => toFormState(employee));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  // Picking a country suggests its local currency; the user can still override it.
  const setCountry = (e) => {
    const code = e.target.value;
    const currency = meta.countries.find((c) => c.code === code)?.currency;
    setForm((f) => ({ ...f, country: code, currency: isNew && currency ? currency : f.currency }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      const payload = toPayload(form);
      const saved = isNew ? await api.createEmployee(payload) : await api.updateEmployee(employee.id, payload);
      onSaved(saved, isNew);
    } catch (err) {
      setErrors(err.fields || {});
      // Field errors are shown inline; anything else (e.g. duplicate email) is shown at the top.
      if (!err.fields || Object.keys(err.fields).length === 0) setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const field = (name, label, extra = {}) => (
    <TextField
      size="small"
      fullWidth
      label={label}
      value={form[name]}
      onChange={set(name)}
      error={Boolean(errors[name])}
      helperText={errors[name]}
      {...extra}
    />
  );

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <form onSubmit={submit} noValidate>
        <DialogTitle>{isNew ? 'Add employee' : 'Edit employee'}</DialogTitle>
        <DialogContent>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, pt: 1 }}>
            {field('firstName', 'First name')}
            {field('lastName', 'Last name')}
            <Box sx={{ gridColumn: { sm: '1 / -1' } }}>{field('email', 'Email', { type: 'email' })}</Box>
            {field('country', 'Country', {
              select: true,
              onChange: setCountry,
              children: meta.countries.map((c) => (
                <MenuItem key={c.code} value={c.code}>{c.name}</MenuItem>
              )),
            })}
            {field('hireDate', 'Hire date', { type: 'date', InputLabelProps: { shrink: true } })}
            {field('department', 'Department', {
              select: false,
              inputProps: { list: 'department-options' },
            })}
            {field('jobTitle', 'Job title', { inputProps: { list: 'job-title-options' } })}
            {field('salary', 'Annual salary', { type: 'number', inputProps: { min: 1, step: 1 } })}
            {field('currency', 'Currency', {
              select: true,
              children: meta.currencies.map((c) => (
                <MenuItem key={c} value={c}>{c}</MenuItem>
              )),
            })}
          </Box>
          {/* Free text with suggestions: lets HR add a new department or title while nudging towards existing ones. */}
          <datalist id="department-options">
            {meta.departments.map((d) => <option key={d} value={d} />)}
          </datalist>
          <datalist id="job-title-options">
            {meta.jobTitles.map((t) => <option key={t} value={t} />)}
          </datalist>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
