import type { Db } from './db.ts';
import { ConflictError, NotFoundError } from './errors.ts';
import { COUNTRIES, USD_RATES, toUsd, usdSql } from './fx.ts';
import type { Employee, EmployeeInput } from './types.ts';

export const SORT_COLUMNS = {
  name: 'last_name {dir}, first_name {dir}',
  email: 'email {dir}',
  country: 'country {dir}',
  department: 'department {dir}',
  jobTitle: 'job_title {dir}',
  salaryUsd: `${usdSql()} {dir}`,
  hireDate: 'hire_date {dir}',
} as const;

export type SortKey = keyof typeof SORT_COLUMNS;

export interface ListQuery {
  q?: string;
  country?: string;
  department?: string;
  jobTitle?: string;
  sortBy: SortKey;
  order: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Meta {
  countries: { code: string; name: string; currency: string }[];
  currencies: string[];
  departments: string[];
  jobTitles: string[];
}

type Row = Record<string, string | number>;

const COLUMNS = 'id, first_name, last_name, email, country, department, job_title, salary, currency, hire_date';

function toEmployee(row: Row): Employee {
  const salary = row.salary as number;
  const currency = row.currency as string;
  return {
    id: row.id as number,
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    email: row.email as string,
    country: row.country as string,
    department: row.department as string,
    jobTitle: row.job_title as string,
    salary,
    currency,
    salaryUsd: Math.round(toUsd(salary, currency)),
    hireDate: row.hire_date as string,
  };
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function isUniqueEmailError(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed: employees\.email/.test(err.message);
}

export class EmployeeRepository {
  private db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  list(query: ListQuery): Page<Employee> {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (query.q) {
      const like = `%${escapeLike(query.q)}%`;
      where.push(
        `(first_name LIKE ? ESCAPE '\\' OR last_name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' ` +
          `OR (first_name || ' ' || last_name) LIKE ? ESCAPE '\\')`,
      );
      params.push(like, like, like, like);
    }
    for (const [column, value] of [
      ['country', query.country],
      ['department', query.department],
      ['job_title', query.jobTitle],
    ] as const) {
      if (value) {
        where.push(`${column} = ?`);
        params.push(value);
      }
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const dir = query.order === 'desc' ? 'DESC' : 'ASC';
    // sortBy is validated against SORT_COLUMNS keys by the caller; the SQL
    // fragment itself comes only from the constant map above.
    const orderSql = SORT_COLUMNS[query.sortBy].replaceAll('{dir}', dir);

    const total = (
      this.db.prepare(`SELECT COUNT(*) AS n FROM employees ${whereSql}`).get(...params) as { n: number }
    ).n;

    const rows = this.db
      .prepare(`SELECT ${COLUMNS} FROM employees ${whereSql} ORDER BY ${orderSql}, id ASC LIMIT ? OFFSET ?`)
      .all(...params, query.pageSize, (query.page - 1) * query.pageSize) as Row[];

    return { items: rows.map(toEmployee), total, page: query.page, pageSize: query.pageSize };
  }

  get(id: number): Employee {
    const row = this.db.prepare(`SELECT ${COLUMNS} FROM employees WHERE id = ?`).get(id) as Row | undefined;
    if (!row) throw new NotFoundError(`Employee ${id} not found`);
    return toEmployee(row);
  }

  create(input: EmployeeInput): Employee {
    try {
      const result = this.db
        .prepare(
          `INSERT INTO employees (first_name, last_name, email, country, department, job_title, salary, currency, hire_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.firstName,
          input.lastName,
          input.email,
          input.country,
          input.department,
          input.jobTitle,
          input.salary,
          input.currency,
          input.hireDate,
        );
      return this.get(Number(result.lastInsertRowid));
    } catch (err) {
      if (isUniqueEmailError(err)) throw new ConflictError('An employee with this email already exists');
      throw err;
    }
  }

  update(id: number, input: EmployeeInput): Employee {
    try {
      const result = this.db
        .prepare(
          `UPDATE employees SET first_name = ?, last_name = ?, email = ?, country = ?, department = ?,
             job_title = ?, salary = ?, currency = ?, hire_date = ?, updated_at = datetime('now')
           WHERE id = ?`,
        )
        .run(
          input.firstName,
          input.lastName,
          input.email,
          input.country,
          input.department,
          input.jobTitle,
          input.salary,
          input.currency,
          input.hireDate,
          id,
        );
      if (result.changes === 0) throw new NotFoundError(`Employee ${id} not found`);
      return this.get(id);
    } catch (err) {
      if (isUniqueEmailError(err)) throw new ConflictError('An employee with this email already exists');
      throw err;
    }
  }

  delete(id: number): void {
    const result = this.db.prepare('DELETE FROM employees WHERE id = ?').run(id);
    if (result.changes === 0) throw new NotFoundError(`Employee ${id} not found`);
  }

  /** Values for filter dropdowns and form selects. */
  meta(): Meta {
    const distinct = (column: string): string[] =>
      (this.db.prepare(`SELECT DISTINCT ${column} AS v FROM employees ORDER BY ${column}`).all() as { v: string }[]).map(
        (r) => r.v,
      );
    return {
      countries: Object.entries(COUNTRIES).map(([code, c]) => ({ code, name: c.name, currency: c.currency })),
      currencies: Object.keys(USD_RATES),
      departments: distinct('department'),
      jobTitles: distinct('job_title'),
    };
  }
}
