import { ValidationError } from './errors.ts';
import { isKnownCountry, isKnownCurrency } from './fx.ts';
import type { EmployeeInput } from './types.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_TEXT = 100;
const MAX_SALARY = 1_000_000_000;

function isRealDate(iso: string): boolean {
  const m = DATE_RE.exec(iso);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/**
 * Validates and normalises an employee payload. Collects every problem so the
 * UI can show all field errors at once. `now` is injectable for tests.
 */
export function validateEmployee(input: unknown, now: Date = new Date()): EmployeeInput {
  const errors: Record<string, string> = {};
  const body = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;

  const text = (field: string, label: string): string => {
    const raw = body[field];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) errors[field] = `${label} is required`;
    else if (value.length > MAX_TEXT) errors[field] = `${label} must be at most ${MAX_TEXT} characters`;
    return value;
  };

  const firstName = text('firstName', 'First name');
  const lastName = text('lastName', 'Last name');
  const department = text('department', 'Department');
  const jobTitle = text('jobTitle', 'Job title');

  const email = text('email', 'Email').toLowerCase();
  if (email && !errors.email && !EMAIL_RE.test(email)) errors.email = 'Email is not valid';

  const country = typeof body.country === 'string' ? body.country.trim().toUpperCase() : '';
  if (!isKnownCountry(country)) errors.country = 'Country is not supported';

  const currency = typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : '';
  if (!isKnownCurrency(currency)) errors.currency = 'Currency is not supported';

  const salary = body.salary;
  if (typeof salary !== 'number' || !Number.isInteger(salary) || salary <= 0) {
    errors.salary = 'Salary must be a positive whole number';
  } else if (salary > MAX_SALARY) {
    errors.salary = 'Salary is unrealistically large';
  }

  const hireDate = typeof body.hireDate === 'string' ? body.hireDate.trim() : '';
  if (!isRealDate(hireDate)) errors.hireDate = 'Hire date must be a valid date (YYYY-MM-DD)';
  else if (hireDate > now.toISOString().slice(0, 10)) errors.hireDate = 'Hire date cannot be in the future';

  if (Object.keys(errors).length > 0) throw new ValidationError(errors);

  return {
    firstName,
    lastName,
    email,
    country,
    department,
    jobTitle,
    salary: salary as number,
    currency,
    hireDate,
  };
}
