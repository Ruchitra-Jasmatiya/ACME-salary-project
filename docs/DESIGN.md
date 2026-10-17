# Design notes

## Architecture

```
 Browser (React + MUI)                      Node process (no npm dependencies)
┌──────────────────────────┐   JSON/HTTP   ┌──────────────────────────────────────────┐
│ Employees │ Insights     │ ────────────► │ api.ts        routing, parsing, errors   │
│ table, dialog, charts    │ ◄──────────── │   │                                      │
└──────────────────────────┘               │   ├─ validation.ts   input rules         │
        (served as static files            │   ├─ repository.ts   employee SQL        │
         by the same process in prod)      │   └─ analytics.ts    stats + outliers    │
                                           │ fx.ts  rates, countries, USD SQL         │
                                           │ db.ts  schema, indexes                   │
                                           └───────────────┬──────────────────────────┘
                                                           ▼
                                                  SQLite file (node:sqlite)
```

Layers only depend downwards. `api.ts` is the only code that knows about HTTP; `repository.ts` and `analytics.ts` are the only code that knows SQL. That keeps each unit testable with an in-memory database and no server.

## Key decisions and trade-offs

| Decision | Why | Cost / revisit when |
|---|---|---|
| **SQLite** | 10k rows; zero ops; reviewers can run it instantly. | Single writer. Move to Postgres for concurrent multi-user writes. SQL is confined to two modules to make that swap small. |
| **Node built-ins only** (`node:sqlite`, `node:http`, `node:test`) | No install step, tiny supply-chain surface for sensitive data, fast tests. | Hand-rolled router and validation instead of Express + zod. `node:sqlite` is still flagged experimental in Node 22. |
| **Salary stored as integer in native currency**; USD computed at read time | Source of truth is what HR typed. Rates can change without rewriting data. | Conversion cost on every aggregate (negligible at this size). Cents are not modelled (annual salaries are whole units). |
| **Static FX rates** | Deterministic, testable, explainable. | Not real-time. `USD_RATES` in `fx.ts` is the single place to replace with a rates table. |
| **Server-side pagination, filter, sort** | Browser never holds 10k rows; sort by USD across currencies works. | More API surface than loading everything client-side. |
| **Sort/filter columns whitelisted**; values always bound as parameters | No SQL injection via query string. | None. There is a test for LIKE wildcard escaping and for unknown dimensions. |
| **Outliers compare peers in same title and country** | Comparing an Indian engineer to a US engineer would flag whole countries. | Needs ≥5 peers; small groups are not assessed. Thresholds (1.5× / 0.67×) are defaults, not policy: HR should tune them. |
| **Free-text department / job title** with suggestions | HR can introduce new roles without a code change. | Typos create near-duplicate groups. Next step: managed lists. |
| **Auto-seed empty database on first boot** | Deployed demo works with zero setup. | Must be disabled (`AUTO_SEED=0`) for a real deployment. |

## Performance

Measured locally with 10,000 seeded rows on a file database:

| Operation | Time |
|---|---|
| Seed 10,000 employees | ~130 ms (single transaction, prepared statement) |
| Employee list, sorted by USD salary | ~10 ms |
| Search + filter | ~5 ms |
| Summary / breakdown | 7–16 ms |
| Outliers | ~27 ms |
| Full server test suite (46 tests) | ~1.2 s |

Indexes exist on country, department, job title, name and hire date. Free-text search uses `LIKE '%term%'`, which scans, but a 10k-row scan is sub-millisecond. At 1M+ rows the upgrade path is SQLite FTS5 or Postgres trigram indexes.

Analytics fetch ordered USD values and reduce them in one pass. That is O(n log n) in SQL plus O(n) in JS and is fine to ~100k rows. Beyond that, push to `percentile_cont` in Postgres or precompute rollups.

## Security and privacy (explicitly out of scope for v1, but called out)

Salary data is highly sensitive. **There is no authentication.** Before real use this needs SSO, role-based access (HR only), audit logging of reads and writes, TLS and encrypted backups. The deployed demo must only ever contain synthetic data. Request bodies are capped at 64 KB, static file serving blocks path traversal, and errors never leak stack traces.

## Testing strategy

- **Unit**: validation rules, FX conversion, median and statistics maths.
- **Repository / analytics**: real SQLite in memory, small hand-computed fixtures (every expected number can be checked by eye).
- **API**: real HTTP server on an ephemeral port, covering status codes, validation errors, conflicts, 404s, bad query parameters.
- **Seed**: determinism, uniqueness, validity against production rules, speed.
- **UI helpers**: pure formatting and form-mapping functions.
- Tests share no state and use no wall clock (validation takes an injectable `now`), so they are deterministic.

## Known gaps

- The React components were written without being able to install or build them in the authoring environment (see AI_USAGE.md). They need a first `npm install && npm run build` and a visual check.
- No component or end-to-end UI tests.
- No audit trail, import/export, or authentication (see requirements).
