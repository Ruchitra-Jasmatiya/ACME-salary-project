import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breakdown, median, outliers, statsOf, summary } from '../src/analytics.ts';
import { BadRequestError } from '../src/errors.ts';
import type { Dimension } from '../src/analytics.ts';
import { setup } from './helpers.ts';

test('median handles empty, odd and even lengths', () => {
  assert.equal(median([]), 0);
  assert.equal(median([5]), 5);
  assert.equal(median([1, 2, 9]), 2);
  assert.equal(median([1, 2, 3, 10]), 2.5);
});

test('statsOf computes headcount, payroll, min, median, average and max', () => {
  assert.deepEqual(statsOf([10, 20, 30, 40]), {
    headcount: 4,
    totalPayroll: 100,
    min: 10,
    median: 25,
    average: 25,
    max: 40,
  });
});

test('statsOf of nothing is all zeros', () => {
  assert.deepEqual(statsOf([]), { headcount: 0, totalPayroll: 0, min: 0, median: 0, average: 0, max: 0 });
});

test('summary normalises currencies to USD before aggregating', () => {
  const { db } = setup([
    { salary: 100_000, currency: 'USD' }, // 100,000
    { salary: 100_000, currency: 'EUR' }, // 108,000
    { salary: 10_000_000, currency: 'INR' }, // 120,000
  ]);
  const s = summary(db);
  assert.equal(s.headcount, 3);
  assert.equal(s.totalPayroll, 328_000);
  assert.equal(s.min, 100_000);
  assert.equal(s.median, 108_000);
  assert.equal(s.max, 120_000);
  assert.equal(s.average, Math.round(328_000 / 3));
});

test('summary on an empty database is zeros, not an error', () => {
  const { db } = setup();
  assert.equal(summary(db).headcount, 0);
});

test('breakdown groups by dimension, largest payroll first', () => {
  const { db } = setup([
    { country: 'US', salary: 100_000, currency: 'USD' },
    { country: 'US', salary: 200_000, currency: 'USD' },
    { country: 'IN', salary: 5_000_000, currency: 'INR' }, // 60,000
  ]);
  const rows = breakdown(db, 'country');
  assert.deepEqual(
    rows.map((r) => [r.key, r.headcount, r.totalPayroll, r.median]),
    [
      ['US', 2, 300_000, 150_000],
      ['IN', 1, 60_000, 60_000],
    ],
  );
});

test('breakdown filters answer questions like "engineering pay by country"', () => {
  const { db } = setup([
    { country: 'IN', department: 'Engineering', salary: 4_000_000, currency: 'INR' }, // 48,000
    { country: 'DE', department: 'Engineering', salary: 70_000, currency: 'EUR' }, // 75,600
    { country: 'DE', department: 'Sales', salary: 50_000, currency: 'EUR' },
  ]);
  const rows = breakdown(db, 'country', { department: 'Engineering' });
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.key === 'DE')?.median, 75_600);
  assert.equal(rows.find((r) => r.key === 'IN')?.median, 48_000);
});

test('breakdown rejects an unknown dimension', () => {
  const { db } = setup();
  assert.throws(() => breakdown(db, 'salary; DROP TABLE employees' as Dimension), BadRequestError);
});

test('outliers flag people far from their peers (same title and country)', () => {
  const { db } = setup([
    ...Array.from({ length: 5 }, () => ({ salary: 100_000 })),
    { salary: 200_000, firstName: 'Rich' }, // 2.0x the median of 100,000
    { salary: 40_000, firstName: 'Poor' }, // 0.4x
  ]);
  const found = outliers(db);
  assert.deepEqual(
    found.map((o) => [o.name.split(' ')[0], o.direction, o.ratio]),
    [
      ['Poor', 'below', 0.4],
      ['Rich', 'above', 2],
    ],
  );
  assert.equal(found[0].peerMedianUsd, 100_000);
});

test('outliers ignore groups that are too small to compare', () => {
  const { db } = setup([{ salary: 100_000 }, { salary: 100_000 }, { salary: 900_000 }]);
  assert.deepEqual(outliers(db), []);
});

test('outliers do not compare across countries', () => {
  const { db } = setup([
    ...Array.from({ length: 5 }, () => ({ country: 'US', salary: 100_000 })),
    ...Array.from({ length: 5 }, () => ({ country: 'IN', salary: 3_000_000, currency: 'INR' })), // 36,000 each
  ]);
  assert.deepEqual(outliers(db), []);
});

test('outliers respect the limit option', () => {
  const { db } = setup([
    ...Array.from({ length: 6 }, () => ({ salary: 100_000 })),
    { salary: 300_000 },
    { salary: 250_000 },
    { salary: 220_000 },
  ]);
  assert.equal(outliers(db, { limit: 2 }).length, 2);
});
