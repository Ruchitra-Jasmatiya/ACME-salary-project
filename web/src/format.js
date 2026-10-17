/** Pure helpers shared by the UI. Kept free of React so they are unit-testable with plain Node. */

/** Formats a whole-unit amount in its own currency, e.g. "₹3,000,000". */
export function formatMoney(amount, currency) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatUsd(amount) {
  return formatMoney(amount, 'USD');
}

/** Compact USD for large totals, e.g. "$328.4M". */
export function formatUsdCompact(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount);
}

export function formatNumber(n) {
  return new Intl.NumberFormat('en-US').format(n);
}

/** Builds a query string, skipping empty values. */
export function buildQuery(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function fullName(employee) {
  return `${employee.firstName} ${employee.lastName}`;
}

/** Returns a blank form state, or one prefilled from an employee for editing. */
export function toFormState(employee) {
  if (!employee) {
    return {
      firstName: '',
      lastName: '',
      email: '',
      country: 'US',
      department: '',
      jobTitle: '',
      salary: '',
      currency: 'USD',
      hireDate: '',
    };
  }
  const { id, salaryUsd, ...rest } = employee;
  return { ...rest, salary: String(employee.salary) };
}

/** Converts form state to the API payload (salary becomes a number). */
export function toPayload(form) {
  const salary = form.salary === '' ? NaN : Number(form.salary);
  return { ...form, salary };
}
