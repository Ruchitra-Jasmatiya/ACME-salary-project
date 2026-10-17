import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEmployee } from '../src/validation.ts';
import { ValidationError } from '../src/errors.ts';
import { toUsd, usdSql } from '../src/fx.ts';

const NOW = new Date('2026-06-15T00:00:00Z');

const valid = {
  firstName: ' Asha ',
  lastName: 'Rao',
  email: 'Asha.Rao@Acme.example',
  country: 'in',
  department: 'Engineering',
  jobTitle: 'Software Engineer',
  salary: 2_400_000,
  currency: 'inr',
  hireDate: '2021-03-01',
};

function fieldsOf(input: unknown): Record<string, string> {
  try {
    validateEmployee(input, NOW);
  } catch (err) {
    assert.ok(err instanceof ValidationError);
    return err.fields;
  }
  assert.fail('expected a ValidationError');
}

test('normalises a valid payload (trim, lowercase email, uppercase codes)', () => {
  const out = validateEmployee(valid, NOW);
  assert.equal(out.firstName, 'Asha');
  assert.equal(out.email, 'asha.rao@acme.example');
  assert.equal(out.country, 'IN');
  assert.equal(out.currency, 'INR');
});

test('reports every missing field at once', () => {
  const fields = fieldsOf({});
  for (const f of ['firstName', 'lastName', 'email', 'country', 'department', 'jobTitle', 'salary', 'currency', 'hireDate']) {
    assert.ok(fields[f], `expected an error for ${f}`);
  }
});

test('rejects non-object input', () => {
  assert.ok(fieldsOf(null).firstName);
  assert.ok(fieldsOf('nope').firstName);
});

test('rejects bad salaries', () => {
  for (const salary of [0, -5, 1.5, '1000', Number.NaN, 2_000_000_000]) {
    assert.ok(fieldsOf({ ...valid, salary }).salary, `salary ${String(salary)} should be rejected`);
  }
});

test('rejects malformed email, unknown country and unknown currency', () => {
  assert.ok(fieldsOf({ ...valid, email: 'not-an-email' }).email);
  assert.ok(fieldsOf({ ...valid, country: 'ZZ' }).country);
  assert.ok(fieldsOf({ ...valid, currency: 'XYZ' }).currency);
});

test('rejects impossible and future hire dates', () => {
  assert.ok(fieldsOf({ ...valid, hireDate: '2021-02-30' }).hireDate);
  assert.ok(fieldsOf({ ...valid, hireDate: '01/03/2021' }).hireDate);
  assert.ok(fieldsOf({ ...valid, hireDate: '2026-06-16' }).hireDate);
  assert.doesNotThrow(() => validateEmployee({ ...valid, hireDate: '2026-06-15' }, NOW));
});

test('rejects over-long text', () => {
  assert.ok(fieldsOf({ ...valid, jobTitle: 'x'.repeat(101) }).jobTitle);
});

test('toUsd converts using static rates and rejects unknown currencies', () => {
  assert.equal(toUsd(100, 'USD'), 100);
  assert.equal(toUsd(1000, 'EUR'), 1080);
  assert.throws(() => toUsd(1, 'XYZ'), /Unknown currency/);
});

test('usdSql covers every supported currency', () => {
  const sql = usdSql('salary', 'currency');
  assert.match(sql, /WHEN 'EUR' THEN 1\.08/);
  assert.match(sql, /WHEN 'INR' THEN 0\.012/);
});
