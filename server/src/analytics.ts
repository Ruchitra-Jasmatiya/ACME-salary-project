import type { Db } from './db.ts';
import { BadRequestError } from './errors.ts';
import { usdSql } from './fx.ts';

/**
 * Salary analytics. All figures are in USD (see fx.ts).
 *
 * Currency conversion, filtering and ordering happen in SQL; the statistics
 * are reduced in a single pass over the sorted values. At 10k rows this takes
 * milliseconds. At much larger scale, move to SQL percentile functions
 * (e.g. Postgres percentile_cont) instead of fetching values.
 */

export type Dimension = 'country' | 'department' | 'jobTitle';

const DIMENSION_COLUMN: Record<Dimension, string> = {
  country: 'country',
  department: 'department',
  jobTitle: 'job_title',
};

export function isDimension(value: string): value is Dimension {
  return Object.hasOwn(DIMENSION_COLUMN, value);
}

export interface SalaryStats {
  headcount: number;
  totalPayroll: number;
  min: number;
  median: number;
  average: number;
  max: number;
}

export interface BreakdownRow extends SalaryStats {
  key: string;
}

export interface Filters {
  country?: string;
  department?: string;
  jobTitle?: string;
}

const EMPTY_STATS: SalaryStats = { headcount: 0, totalPayroll: 0, min: 0, median: 0, average: 0, max: 0 };

/** Median of an ascending-sorted array. Returns 0 for an empty array. */
export function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Statistics for an ascending-sorted array of USD amounts. */
export function statsOf(sorted: number[]): SalaryStats {
  if (sorted.length === 0) return { ...EMPTY_STATS };
  const total = sorted.reduce((sum, v) => sum + v, 0);
  return {
    headcount: sorted.length,
    totalPayroll: Math.round(total),
    min: Math.round(sorted[0]),
    median: Math.round(median(sorted)),
    average: Math.round(total / sorted.length),
    max: Math.round(sorted[sorted.length - 1]),
  };
}

function whereClause(filters: Filters): { sql: string; params: string[] } {
  const parts: string[] = [];
  const params: string[] = [];
  for (const [column, value] of [
    ['country', filters.country],
    ['department', filters.department],
    ['job_title', filters.jobTitle],
  ] as const) {
    if (value) {
      parts.push(`${column} = ?`);
      params.push(value);
    }
  }
  return { sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params };
}

/** Org-wide (or filtered) statistics. */
export function summary(db: Db, filters: Filters = {}): SalaryStats {
  const { sql, params } = whereClause(filters);
  const rows = db
    .prepare(`SELECT ${usdSql()} AS usd FROM employees ${sql} ORDER BY usd`)
    .all(...params) as { usd: number }[];
  return statsOf(rows.map((r) => r.usd));
}

/** Statistics grouped by a dimension, optionally restricted by filters. Largest payroll first. */
export function breakdown(db: Db, by: Dimension, filters: Filters = {}): BreakdownRow[] {
  if (!isDimension(by)) throw new BadRequestError(`Unknown dimension: ${String(by)}`);
  const column = DIMENSION_COLUMN[by];
  const { sql, params } = whereClause(filters);
  const rows = db
    .prepare(`SELECT ${column} AS grp, ${usdSql()} AS usd FROM employees ${sql} ORDER BY grp, usd`)
    .all(...params) as { grp: string; usd: number }[];

  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const list = groups.get(row.grp);
    if (list) list.push(row.usd);
    else groups.set(row.grp, [row.usd]);
  }
  return [...groups.entries()]
    .map(([key, values]) => ({ key, ...statsOf(values) }))
    .sort((a, b) => b.totalPayroll - a.totalPayroll || a.key.localeCompare(b.key));
}

export interface OutlierOptions {
  /** Smallest peer group (same job title and country) worth comparing. */
  minGroupSize?: number;
  /** Flag people paid at or above this multiple of the peer median. */
  highRatio?: number;
  /** Flag people paid at or below this multiple of the peer median. */
  lowRatio?: number;
  limit?: number;
}

export interface Outlier {
  id: number;
  name: string;
  jobTitle: string;
  country: string;
  salary: number;
  currency: string;
  salaryUsd: number;
  peerMedianUsd: number;
  peerCount: number;
  ratio: number;
  direction: 'above' | 'below';
}

/**
 * People paid far from the median of their peers (same job title in the same
 * country, so cost-of-labour differences between countries do not drown the
 * signal). Useful for spotting inequity and data-entry mistakes.
 */
export function outliers(db: Db, options: OutlierOptions = {}): Outlier[] {
  const { minGroupSize = 5, highRatio = 1.5, lowRatio = 0.67, limit = 50 } = options;

  const rows = db
    .prepare(
      `SELECT id, first_name || ' ' || last_name AS name, job_title, country, salary, currency, ${usdSql()} AS usd
       FROM employees ORDER BY job_title, country, usd`,
    )
    .all() as {
    id: number;
    name: string;
    job_title: string;
    country: string;
    salary: number;
    currency: string;
    usd: number;
  }[];

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.job_title}\u0000${row.country}`;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  const found: Outlier[] = [];
  for (const group of groups.values()) {
    if (group.length < minGroupSize) continue;
    const peerMedian = median(group.map((r) => r.usd));
    if (peerMedian <= 0) continue;
    for (const row of group) {
      const ratio = row.usd / peerMedian;
      if (ratio >= highRatio || ratio <= lowRatio) {
        found.push({
          id: row.id,
          name: row.name,
          jobTitle: row.job_title,
          country: row.country,
          salary: row.salary,
          currency: row.currency,
          salaryUsd: Math.round(row.usd),
          peerMedianUsd: Math.round(peerMedian),
          peerCount: group.length,
          ratio: Math.round(ratio * 100) / 100,
          direction: ratio >= highRatio ? 'above' : 'below',
        });
      }
    }
  }

  // Furthest from the median first, in either direction.
  const distance = (o: Outlier): number => Math.abs(Math.log(o.ratio));
  return found.sort((a, b) => distance(b) - distance(a) || a.id - b.id).slice(0, limit);
}
