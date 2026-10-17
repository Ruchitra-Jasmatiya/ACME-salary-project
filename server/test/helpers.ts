import { openDb } from '../src/db.ts';
import type { Db } from '../src/db.ts';
import { EmployeeRepository } from '../src/repository.ts';
import type { EmployeeInput } from '../src/types.ts';

let counter = 0;

/** Builds a valid employee payload; override any field. */
export function makeEmployee(overrides: Partial<EmployeeInput> = {}): EmployeeInput {
  counter += 1;
  return {
    firstName: 'Test',
    lastName: `Person${counter}`,
    email: `test.person${counter}@acme.example`,
    country: 'US',
    department: 'Engineering',
    jobTitle: 'Software Engineer',
    salary: 100_000,
    currency: 'USD',
    hireDate: '2022-01-10',
    ...overrides,
  };
}

/** Fresh in-memory database plus repository, populated with the given rows. */
export function setup(rows: Partial<EmployeeInput>[] = []): { db: Db; repo: EmployeeRepository } {
  const db = openDb();
  const repo = new EmployeeRepository(db);
  for (const row of rows) repo.create(makeEmployee(row));
  return { db, repo };
}
