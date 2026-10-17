import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS employees (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  country     TEXT NOT NULL,
  department  TEXT NOT NULL,
  job_title   TEXT NOT NULL,
  salary      INTEGER NOT NULL CHECK (salary > 0),
  currency    TEXT NOT NULL,
  hire_date   TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Filters and sorts the directory and insights rely on.
CREATE INDEX IF NOT EXISTS idx_employees_country    ON employees (country);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees (department);
CREATE INDEX IF NOT EXISTS idx_employees_job_title  ON employees (job_title);
CREATE INDEX IF NOT EXISTS idx_employees_last_name  ON employees (last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_employees_hire_date  ON employees (hire_date);
`;

/** Opens (and migrates) a database. Defaults to a private in-memory database. */
export function openDb(path = ':memory:'): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}
