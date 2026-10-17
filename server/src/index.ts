import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './api.ts';
import { openDb } from './db.ts';
import { seedDatabase } from './seedData.ts';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3001);
const dbPath = resolve(process.env.DB_PATH ?? resolve(here, '../data/acme.db'));
const webDir = resolve(process.env.WEB_DIR ?? resolve(here, '../../web/dist'));

mkdirSync(dirname(dbPath), { recursive: true });
const db = openDb(dbPath);

// Zero-setup deploys: an empty database is seeded on first boot.
const { n } = db.prepare('SELECT COUNT(*) AS n FROM employees').get() as { n: number };
if (n === 0 && process.env.AUTO_SEED !== '0') {
  const started = Date.now();
  seedDatabase(db, 10_000);
  console.log(`Seeded 10,000 employees in ${Date.now() - started}ms`);
}

const server = createServer(createApp(db, { webDir: existsSync(webDir) ? webDir : undefined }));
server.listen(port, () => console.log(`ACME salary API listening on http://localhost:${port} (db: ${dbPath})`));

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => db.close()));
}
