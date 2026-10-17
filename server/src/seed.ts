import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { openDb } from './db.ts';
import { seedDatabase } from './seedData.ts';

const here = dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({
  options: {
    count: { type: 'string', default: '10000' },
    seed: { type: 'string', default: '42' },
    db: { type: 'string', default: process.env.DB_PATH ?? resolve(here, '../data/acme.db') },
  },
});

const count = Number(values.count);
if (!Number.isInteger(count) || count < 1) {
  console.error('--count must be a positive integer');
  process.exit(1);
}

const dbPath = resolve(values.db);
mkdirSync(dirname(dbPath), { recursive: true });
const db = openDb(dbPath);

const started = Date.now();
const inserted = seedDatabase(db, count, Number(values.seed));
console.log(`Seeded ${inserted} employees into ${dbPath} in ${Date.now() - started}ms`);
db.close();
