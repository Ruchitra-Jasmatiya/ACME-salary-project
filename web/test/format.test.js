import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuery, formatMoney, formatUsd, formatUsdCompact, fullName, toFormState, toPayload } from '../src/format.js';

test('buildQuery skips empty values and encodes the rest', () => {
  assert.equal(buildQuery({ q: '', country: undefined, page: 1, name: 'a b' }), '?page=1&name=a+b');
  assert.equal(buildQuery({ q: '', x: null }), '');
});

test('formatMoney formats in the employee currency without decimals', () => {
  assert.equal(formatMoney(95000, 'USD'), '$95,000');
  assert.equal(formatUsd(1234567), '$1,234,567');
  assert.match(formatMoney(80000, 'EUR'), /80,000/);
});

test('formatUsdCompact abbreviates large totals', () => {
  assert.equal(formatUsdCompact(328_400_000), '$328.4M');
});

test('fullName joins first and last name', () => {
  assert.equal(fullName({ firstName: 'Priya', lastName: 'Sharma' }), 'Priya Sharma');
});

test('toFormState returns a blank form for new employees and a copy for existing ones', () => {
  assert.equal(toFormState(null).country, 'US');
  const form = toFormState({
    id: 5,
    salaryUsd: 36000,
    firstName: 'Priya',
    lastName: 'Sharma',
    email: 'p@acme.example',
    country: 'IN',
    department: 'Engineering',
    jobTitle: 'Software Engineer',
    salary: 3000000,
    currency: 'INR',
    hireDate: '2021-01-01',
  });
  assert.equal(form.salary, '3000000');
  assert.equal('id' in form, false);
  assert.equal('salaryUsd' in form, false);
});

test('toPayload converts salary to a number, and blank salary to NaN so validation rejects it', () => {
  assert.equal(toPayload({ salary: '2500' }).salary, 2500);
  assert.ok(Number.isNaN(toPayload({ salary: '' }).salary));
});
