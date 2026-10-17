# How AI was used

Tool: Claude (Sonnet 5.5) in an agentic coding session with file and shell access. This file records what I asked, what I let it do, and what I verified.

## Workflow

1. **Requirements first.** I gave Claude the assignment brief and had it draft the one-page requirements (`docs/REQUIREMENTS.md`) before any code, with an explicit "left out and why" section.
2. **Plan as a task list**, then build in small vertical slices, committing after each one: validation and FX → repository → analytics → seed → API → UI → docs.
3. **Tests alongside code.** Each slice was committed only after its tests passed.
4. **Measure, don't assume.** I seeded 10,000 rows and timed real HTTP calls against the 200 ms goal in the requirements.

## Representative prompts

- *"Write a one-page requirements document: goal, scope and features, what you are deliberately leaving out and why. Persona is an HR manager with 10,000 employees across countries managing salaries in Excel."*
- *"Design the schema and repository for employees. Salary in native currency; compute USD at read time. Whitelist sort columns. Search must treat % and _ literally."*
- *"Add insights: summary, breakdown by country / department / job title, and pay outliers. Compare peers in the same title and the same country so cross-country pay differences don't dominate."*
- *"Seed script: 10,000 employees, deterministic, multiple countries and currencies, a small share of deliberate outliers. Must be fast."*
- *"Write tests with hand-computable fixtures. No wall clock, no shared state."*

## Decisions where I steered the AI

- **Zero-dependency backend.** The authoring sandbox blocks the npm registry (HTTP 403 from the egress proxy), so Express / better-sqlite3 / Vitest could not be installed. I chose to build the backend on Node built-ins (`node:sqlite`, `node:http`, `node:test`) so it could be built and tested for real, and to write the React UI as source to be installed locally. The AI offered three options and I picked this one.
- **Outlier definition.** The first idea was "compare to job-title median". I changed it to title *and* country after noting that it would flag entire countries.
- **Static FX rates** instead of a live API, for determinism.

## What I verified myself (not just trusting generated code)

- All 46 backend tests and 6 UI-helper tests pass (`npm test` in `server/` and `web/`).
- Ran the real seed script and server; hit every endpoint with curl; recorded timings (see DESIGN.md).
- Checked that unknown sort/dimension values return 400, not a SQL error.

## What I did NOT verify

- **The React/MUI components have never been installed, built or rendered** in the authoring environment. They are plain JSX using standard MUI components, but expect to fix small issues on first `npm run build`.
- The `Dockerfile` and `render.yaml` were written but never built or run (no Docker or network in the authoring environment).
- Deployment and the demo video were not produced by the AI.

## Reflection

AI was fastest at boilerplate, test fixtures and keeping layers consistent. It needed steering on product judgment (what counts as an outlier, what to leave out) and on honesty about what had and had not been run.
