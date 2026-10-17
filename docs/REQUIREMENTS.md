# ACME Salary Management: Requirements (one page)

## Goal
Replace the HR team's Excel files with a web app so the HR Manager can maintain salary data for ~10,000 employees across multiple countries, and answer "how do we pay people?" in seconds instead of hours.

## Persona
**HR Manager** (single trusted user). Needs to: find a person, fix or add a record, and understand pay distribution by country, department and role.

## Scope and features (v1)
1. **Employee directory**: server-side paginated table (10k rows), search by name/email, filter by country, department, job title, sort by any column.
2. **Create / edit / delete employee**: name, email, country, department, job title, salary, currency, hire date. Validation (required fields, positive salary, valid currency, unique email).
3. **Salary insights dashboard**: headcount, total payroll and min / median / average / max salary, sliceable by country, department and job title. All figures are normalized to one reporting currency (USD) so multi-country numbers are comparable; native currency is still stored and shown.
4. **Pay outlier view**: people paid far above or below their job title's median (surfaces inequity and data-entry errors).
5. **Seed script**: deterministic generation of 10,000 realistic employees.
6. **Tests** for validation, repository queries, analytics math and the HTTP API.

## Deliberately left out (and why)
| Not in v1 | Reasoning |
|---|---|
| Authentication / roles | One persona. Real SSO/RBAC is essential for salary data but is a separate workstream; noted as the first production gap. |
| Salary history / audit trail | Valuable, but doubles the data model. The schema leaves room (separate table later). |
| Bonuses, equity, benefits | Base salary answers the stated question; total comp has contested definitions that need HR input. |
| Live FX rates | Static, documented rates keep results deterministic and testable; a rates table is the extension point. |
| Excel import/export | Migration is a one-off; the seed script stands in for it. Export is a likely fast follow. |
| Payroll runs, tax, approvals | Different product (payroll), not salary *management/insight*. |
| Multi-tenant, i18n | Single org, English-speaking HR user. |

## Key decisions
- **SQLite**: 10k rows is tiny, zero ops, easy for reviewers to run. Repository layer isolates SQL so Postgres is a swap.
- **Aggregation in SQL, pagination on the server**: the browser never receives 10k rows.
- **Median computed in the app layer from SQL-sorted values**, since SQLite lacks a median function.

## Success criteria
- Directory loads and filters in under 200 ms at 10k rows.
- Any insight question (e.g. median engineering pay in India vs Germany) answerable in two clicks.
- Seed completes in a few seconds; test suite runs in seconds.
