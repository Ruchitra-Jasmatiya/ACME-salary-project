import type { Db } from './db.ts';
import { COUNTRIES, USD_RATES } from './fx.ts';
import type { EmployeeInput } from './types.ts';

/** Small deterministic PRNG (mulberry32) so seeds are reproducible. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  'Aarav', 'Priya', 'Rohan', 'Ananya', 'Vikram', 'Meera', 'Arjun', 'Kavya', 'Sanjay', 'Neha',
  'James', 'Emily', 'Michael', 'Sophia', 'Daniel', 'Olivia', 'Ethan', 'Chloe', 'Lucas', 'Grace',
  'Hans', 'Lena', 'Felix', 'Clara', 'Jonas', 'Marie', 'Louis', 'Camille', 'Hugo', 'Ines',
  'Yuki', 'Haruto', 'Mei', 'Wei', 'Jun', 'Aiko', 'Carlos', 'Beatriz', 'Mateus', 'Luiza',
];
const LAST_NAMES = [
  'Sharma', 'Patel', 'Iyer', 'Reddy', 'Gupta', 'Nair', 'Singh', 'Mehta', 'Kapoor', 'Joshi',
  'Smith', 'Johnson', 'Brown', 'Taylor', 'Wilson', 'Clark', 'Walker', 'Hall', 'Young', 'King',
  'Muller', 'Schmidt', 'Weber', 'Fischer', 'Wagner', 'Dubois', 'Martin', 'Bernard', 'Petit', 'Moreau',
  'Tanaka', 'Suzuki', 'Sato', 'Tan', 'Lim', 'Wong', 'Silva', 'Santos', 'Oliveira', 'Costa',
];

interface Role {
  department: string;
  jobTitle: string;
  /** Typical annual base in USD for a US employee. */
  baseUsd: number;
  /** Relative frequency within the company. */
  weight: number;
}

const ROLES: Role[] = [
  { department: 'Engineering', jobTitle: 'Software Engineer', baseUsd: 95_000, weight: 18 },
  { department: 'Engineering', jobTitle: 'Senior Software Engineer', baseUsd: 130_000, weight: 10 },
  { department: 'Engineering', jobTitle: 'Staff Engineer', baseUsd: 170_000, weight: 3 },
  { department: 'Engineering', jobTitle: 'Engineering Manager', baseUsd: 160_000, weight: 3 },
  { department: 'Engineering', jobTitle: 'QA Engineer', baseUsd: 75_000, weight: 6 },
  { department: 'Engineering', jobTitle: 'DevOps Engineer', baseUsd: 110_000, weight: 5 },
  { department: 'Product', jobTitle: 'Product Manager', baseUsd: 120_000, weight: 4 },
  { department: 'Product', jobTitle: 'Product Designer', baseUsd: 90_000, weight: 3 },
  { department: 'Sales', jobTitle: 'Sales Development Rep', baseUsd: 55_000, weight: 7 },
  { department: 'Sales', jobTitle: 'Account Executive', baseUsd: 85_000, weight: 7 },
  { department: 'Sales', jobTitle: 'Sales Manager', baseUsd: 120_000, weight: 2 },
  { department: 'Marketing', jobTitle: 'Marketing Specialist', baseUsd: 65_000, weight: 4 },
  { department: 'Marketing', jobTitle: 'Marketing Manager', baseUsd: 100_000, weight: 2 },
  { department: 'HR', jobTitle: 'Recruiter', baseUsd: 65_000, weight: 3 },
  { department: 'HR', jobTitle: 'HR Generalist', baseUsd: 60_000, weight: 2 },
  { department: 'HR', jobTitle: 'HR Manager', baseUsd: 95_000, weight: 1 },
  { department: 'Finance', jobTitle: 'Accountant', baseUsd: 70_000, weight: 4 },
  { department: 'Finance', jobTitle: 'Financial Analyst', baseUsd: 80_000, weight: 3 },
  { department: 'Finance', jobTitle: 'Finance Manager', baseUsd: 115_000, weight: 1 },
  { department: 'Support', jobTitle: 'Support Agent', baseUsd: 45_000, weight: 8 },
  { department: 'Support', jobTitle: 'Support Lead', baseUsd: 70_000, weight: 2 },
];

interface CountryProfile {
  code: string;
  weight: number;
  /** Local pay level relative to the US. */
  payFactor: number;
}

const COUNTRY_PROFILES: CountryProfile[] = [
  { code: 'US', weight: 25, payFactor: 1.0 },
  { code: 'IN', weight: 25, payFactor: 0.3 },
  { code: 'GB', weight: 10, payFactor: 0.8 },
  { code: 'DE', weight: 10, payFactor: 0.82 },
  { code: 'CA', weight: 6, payFactor: 0.85 },
  { code: 'FR', weight: 6, payFactor: 0.75 },
  { code: 'AU', weight: 5, payFactor: 0.9 },
  { code: 'SG', weight: 5, payFactor: 0.85 },
  { code: 'JP', weight: 4, payFactor: 0.75 },
  { code: 'BR', weight: 4, payFactor: 0.4 },
];

/** Fixed "today" so generated hire dates never depend on the wall clock. */
const REFERENCE_DATE = Date.UTC(2026, 9, 1);
const MAX_TENURE_DAYS = 12 * 365;
const OUTLIER_RATE = 0.012;

function pickWeighted<T extends { weight: number }>(items: T[], rng: () => number): T {
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  let roll = rng() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll < 0) return item;
  }
  return items[items.length - 1];
}

/** Round to three significant figures, like real-world salary figures. */
function roundSalary(amount: number): number {
  const step = 10 ** Math.max(0, Math.floor(Math.log10(amount)) - 2);
  return Math.max(1, Math.round(amount / step) * step);
}

/**
 * Generates `count` realistic, reproducible employees across ten countries.
 * About 1% are deliberately paid far from their peers so the outlier view
 * has something to show.
 */
export function generateEmployees(count: number, seed = 42): EmployeeInput[] {
  const rng = createRng(seed);
  const emailCounts = new Map<string, number>();
  const result: EmployeeInput[] = [];

  for (let i = 0; i < count; i += 1) {
    const firstName = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
    const lastName = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
    const role = pickWeighted(ROLES, rng);
    const profile = pickWeighted(COUNTRY_PROFILES, rng);
    const currency = COUNTRIES[profile.code].currency;

    let usd = role.baseUsd * profile.payFactor * (0.88 + rng() * 0.28);
    if (rng() < OUTLIER_RATE) usd *= rng() < 0.5 ? 1.9 : 0.45;
    const salary = roundSalary(usd / USD_RATES[currency]);

    const handle = `${firstName}.${lastName}`.toLowerCase();
    const seen = emailCounts.get(handle) ?? 0;
    emailCounts.set(handle, seen + 1);

    const hired = new Date(REFERENCE_DATE - Math.floor(rng() * MAX_TENURE_DAYS) * 86_400_000);

    result.push({
      firstName,
      lastName,
      email: `${handle}${seen === 0 ? '' : seen + 1}@acme.example`,
      country: profile.code,
      department: role.department,
      jobTitle: role.jobTitle,
      salary,
      currency,
      hireDate: hired.toISOString().slice(0, 10),
    });
  }
  return result;
}

/** Replaces all employees with freshly generated ones, in one transaction. */
export function seedDatabase(db: Db, count: number, seed = 42): number {
  const rows = generateEmployees(count, seed);
  const insert = db.prepare(
    `INSERT INTO employees (first_name, last_name, email, country, department, job_title, salary, currency, hire_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM employees');
    for (const e of rows) {
      insert.run(e.firstName, e.lastName, e.email, e.country, e.department, e.jobTitle, e.salary, e.currency, e.hireDate);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return rows.length;
}
