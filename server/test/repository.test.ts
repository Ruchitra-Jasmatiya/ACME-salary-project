import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConflictError, NotFoundError } from '../src/errors.ts';
import type { ListQuery } from '../src/repository.ts';
import { makeEmployee, setup } from './helpers.ts';

const defaults: ListQuery = { sortBy: 'name', order: 'asc', page: 1, pageSize: 25 };

test('create then get round-trips and computes salaryUsd', () => {
  const { repo } = setup();
  const created = repo.create(makeEmployee({ salary: 1000, currency: 'EUR', email: 'a@acme.example' }));
  assert.equal(created.salaryUsd, 1080);
  assert.deepEqual(repo.get(created.id), created);
});

test('duplicate email (case-insensitive) is a conflict', () => {
  const { repo } = setup();
  repo.create(makeEmployee({ email: 'dup@acme.example' }));
  assert.throws(() => repo.create(makeEmployee({ email: 'DUP@acme.example' })), ConflictError);
});

test('update changes fields, and conflicts on another employee email', () => {
  const { repo } = setup();
  const a = repo.create(makeEmployee({ email: 'a@acme.example' }));
  const b = repo.create(makeEmployee({ email: 'b@acme.example' }));
  const updated = repo.update(a.id, makeEmployee({ email: 'a@acme.example', salary: 123_456 }));
  assert.equal(updated.salary, 123_456);
  assert.throws(() => repo.update(b.id, makeEmployee({ email: 'a@acme.example' })), ConflictError);
});

test('update and delete of a missing employee throw NotFound', () => {
  const { repo } = setup();
  assert.throws(() => repo.update(999, makeEmployee()), NotFoundError);
  assert.throws(() => repo.delete(999), NotFoundError);
  assert.throws(() => repo.get(999), NotFoundError);
});

test('delete removes the employee', () => {
  const { repo } = setup();
  const e = repo.create(makeEmployee());
  repo.delete(e.id);
  assert.throws(() => repo.get(e.id), NotFoundError);
});

test('list paginates and reports the total', () => {
  const { repo } = setup(Array.from({ length: 7 }, () => ({})));
  const page2 = repo.list({ ...defaults, page: 2, pageSize: 3 });
  assert.equal(page2.total, 7);
  assert.equal(page2.items.length, 3);
  const page3 = repo.list({ ...defaults, page: 3, pageSize: 3 });
  assert.equal(page3.items.length, 1);
});

test('list filters by country, department and job title together', () => {
  const { repo } = setup([
    { country: 'IN', department: 'Engineering', jobTitle: 'Software Engineer' },
    { country: 'IN', department: 'Sales', jobTitle: 'Account Executive' },
    { country: 'DE', department: 'Engineering', jobTitle: 'Software Engineer' },
  ]);
  assert.equal(repo.list({ ...defaults, country: 'IN' }).total, 2);
  assert.equal(repo.list({ ...defaults, country: 'IN', department: 'Engineering' }).total, 1);
  assert.equal(repo.list({ ...defaults, jobTitle: 'Software Engineer' }).total, 2);
});

test('search matches name, full name and email, case-insensitively', () => {
  const { repo } = setup([
    { firstName: 'Priya', lastName: 'Sharma', email: 'priya.sharma@acme.example' },
    { firstName: 'Tom', lastName: 'Becker', email: 'tom.becker@acme.example' },
  ]);
  assert.equal(repo.list({ ...defaults, q: 'priya' }).total, 1);
  assert.equal(repo.list({ ...defaults, q: 'Priya Sharma' }).total, 1);
  assert.equal(repo.list({ ...defaults, q: 'BECKER@ACME' }).total, 1);
  assert.equal(repo.list({ ...defaults, q: 'nobody' }).total, 0);
});

test('search treats LIKE wildcards literally', () => {
  const { repo } = setup([{ firstName: 'Ann' }, { firstName: 'Bob' }]);
  assert.equal(repo.list({ ...defaults, q: '%' }).total, 0);
  assert.equal(repo.list({ ...defaults, q: '_' }).total, 0);
});

test('sorting by salaryUsd compares across currencies', () => {
  const { repo } = setup([
    { firstName: 'Low', salary: 90_000, currency: 'USD' }, // 90,000 USD
    { firstName: 'High', salary: 100_000, currency: 'EUR' }, // 108,000 USD
    { firstName: 'Mid', salary: 100_000, currency: 'GBP' }, // 127,000 USD
    { firstName: 'Tiny', salary: 5_000_000, currency: 'INR' }, // 60,000 USD
  ]);
  const asc = repo.list({ ...defaults, sortBy: 'salaryUsd', order: 'asc' }).items.map((e) => e.firstName);
  assert.deepEqual(asc, ['Tiny', 'Low', 'High', 'Mid']);
  const desc = repo.list({ ...defaults, sortBy: 'salaryUsd', order: 'desc' }).items.map((e) => e.firstName);
  assert.deepEqual(desc, ['Mid', 'High', 'Low', 'Tiny']);
});

test('meta lists distinct departments and job titles', () => {
  const { repo } = setup([
    { department: 'Sales', jobTitle: 'Account Executive' },
    { department: 'Engineering', jobTitle: 'Software Engineer' },
    { department: 'Engineering', jobTitle: 'Software Engineer' },
  ]);
  const meta = repo.meta();
  assert.deepEqual(meta.departments, ['Engineering', 'Sales']);
  assert.deepEqual(meta.jobTitles, ['Account Executive', 'Software Engineer']);
  assert.ok(meta.currencies.includes('INR'));
  assert.ok(meta.countries.some((c) => c.code === 'IN' && c.currency === 'INR'));
});
