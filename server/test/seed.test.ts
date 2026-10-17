import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.ts';
import { outliers, summary } from '../src/analytics.ts';
import { generateEmployees, seedDatabase } from '../src/seedData.ts';
import { validateEmployee } from '../src/validation.ts';

test('generation is deterministic for a given seed and differs across seeds', () => {
  assert.deepEqual(generateEmployees(200, 7), generateEmployees(200, 7));
  assert.notDeepEqual(generateEmployees(200, 7), generateEmployees(200, 8));
});

test('every generated employee passes the production validation rules', () => {
  const now = new Date('2026-10-17T00:00:00Z');
  for (const e of generateEmployees(2_000)) {
    assert.doesNotThrow(() => validateEmployee(e, now), `${e.email} should be valid`);
  }
});

test('generated emails are unique', () => {
  const emails = generateEmployees(10_000).map((e) => e.email);
  assert.equal(new Set(emails).size, emails.length);
});

test('seeding 10,000 employees is fast and idempotent', () => {
  const db = openDb();
  const started = Date.now();
  assert.equal(seedDatabase(db, 10_000), 10_000);
  assert.ok(Date.now() - started < 5_000, 'seeding should take well under 5s');
  assert.equal(summary(db).headcount, 10_000);

  // Re-seeding replaces rather than appends.
  seedDatabase(db, 10_000);
  assert.equal(summary(db).headcount, 10_000);
});

test('seed data spans multiple countries and yields some pay outliers', () => {
  const db = openDb();
  seedDatabase(db, 10_000);
  const countries = (db.prepare('SELECT COUNT(DISTINCT country) AS n FROM employees').get() as { n: number }).n;
  assert.equal(countries, 10);
  assert.ok(outliers(db, { limit: 500 }).length > 0);
});
