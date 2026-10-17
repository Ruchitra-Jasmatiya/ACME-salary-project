# ACME Salary Management

Web software for an HR Manager to manage salary data for ~10,000 employees across multiple countries and answer "how do we pay people?".

- **Requirements:** [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)
- **Design, trade-offs, performance:** [docs/DESIGN.md](docs/DESIGN.md)
- **How AI was used:** [docs/AI_USAGE.md](docs/AI_USAGE.md)

## Features

- Employee directory: search, filter by country / department / job title, sort, server-side pagination
- Add, edit, delete employees with field-level validation
- Insights: headcount, payroll, min / median / average / max (USD-normalised) by country, department, job title
- Pay outliers vs. same-title, same-country peers
- Deterministic seed of 10,000 employees across 10 countries

## Run it

Requires **Node 22.18+** (uses built-in `node:sqlite` and native TypeScript).

```bash
# 1. Build the UI (needs the npm registry)
cd web && npm install && npm run build && cd ..

# 2. Start the server. An empty database is seeded with 10,000 employees on first boot.
cd server && npm start
# open http://localhost:3001
```

Development with hot reload:

```bash
cd server && npm run dev          # API on :3001
cd web && npm install && npm run dev   # UI on :5173, proxies /api to :3001
```

Seed manually: `cd server && npm run seed -- --count 10000 --seed 42`

Environment variables: `PORT` (3001), `DB_PATH` (`server/data/acme.db`), `WEB_DIR` (`web/dist`), `AUTO_SEED=0` to disable first-boot seeding.

## Tests

```bash
cd server && npm test   # 46 tests, ~1s, no dependencies to install
cd web && npm test      # UI helper tests
```

## Deploy

A `Dockerfile` builds the UI and runs the API, serving both from one port. `render.yaml` is a ready blueprint for Render (or run `docker build -t acme-salary . && docker run -p 3001:3001 acme-salary`). The demo seeds itself on boot; use synthetic data only, there is no authentication (see DESIGN.md).

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/employees` | `q, country, department, jobTitle, sortBy, order, page, pageSize` |
| POST | `/api/employees` | 201, or 400 with `fields`, or 409 duplicate email |
| GET / PUT / DELETE | `/api/employees/:id` | 404 if missing |
| GET | `/api/meta` | filter options |
| GET | `/api/insights/summary` | optional `country, department, jobTitle` |
| GET | `/api/insights/breakdown?by=country\|department\|jobTitle` | same optional filters |
| GET | `/api/insights/outliers?limit=` | |

## Layout

```
server/src   api, validation, repository, analytics, fx, seed
server/test  node:test suites (in-memory SQLite)
web/src      React + MUI components
docs/        requirements, design, AI usage
```
