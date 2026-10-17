import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/api.ts';
import { makeEmployee, setup } from './helpers.ts';

let server: Server;
let base: string;

before(async () => {
  const { db } = setup([
    { firstName: 'Priya', lastName: 'Sharma', country: 'IN', salary: 3_000_000, currency: 'INR', email: 'priya@acme.example' },
    { firstName: 'Tom', lastName: 'Becker', country: 'DE', salary: 80_000, currency: 'EUR', email: 'tom@acme.example' },
  ]);
  server = createServer(createApp(db));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(base + path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : undefined };
}

test('GET /api/health', async () => {
  const { status, json } = await call('GET', '/api/health');
  assert.equal(status, 200);
  assert.equal(json.status, 'ok');
});

test('GET /api/employees returns a page with filters applied', async () => {
  const all = await call('GET', '/api/employees');
  assert.equal(all.json.total, 2);
  const india = await call('GET', '/api/employees?country=IN');
  assert.equal(india.json.total, 1);
  assert.equal(india.json.items[0].firstName, 'Priya');
  assert.equal(india.json.items[0].salaryUsd, 36_000);
});

test('GET /api/employees rejects bad query parameters with 400', async () => {
  for (const qs of ['sortBy=password', 'order=sideways', 'pageSize=1000', 'page=0', 'page=abc']) {
    const { status, json } = await call('GET', `/api/employees?${qs}`);
    assert.equal(status, 400, qs);
    assert.ok(json.error);
  }
});

test('POST validates, creates, and rejects duplicates', async () => {
  const bad = await call('POST', '/api/employees', { firstName: '' });
  assert.equal(bad.status, 400);
  assert.ok(bad.json.fields.firstName);

  const created = await call('POST', '/api/employees', makeEmployee({ email: 'new@acme.example' }));
  assert.equal(created.status, 201);
  assert.ok(created.json.id > 0);

  const dup = await call('POST', '/api/employees', makeEmployee({ email: 'new@acme.example' }));
  assert.equal(dup.status, 409);
});

test('POST with invalid JSON is a 400', async () => {
  const { status } = await call('POST', '/api/employees', '{not json');
  assert.equal(status, 400);
});

test('PUT updates, DELETE removes, and missing ids are 404', async () => {
  const created = await call('POST', '/api/employees', makeEmployee({ email: 'edit@acme.example' }));
  const id = created.json.id;

  const updated = await call('PUT', `/api/employees/${id}`, makeEmployee({ email: 'edit@acme.example', salary: 555_000 }));
  assert.equal(updated.status, 200);
  assert.equal(updated.json.salary, 555_000);

  assert.equal((await call('DELETE', `/api/employees/${id}`)).status, 204);
  assert.equal((await call('GET', `/api/employees/${id}`)).status, 404);
  assert.equal((await call('PUT', '/api/employees/99999', makeEmployee())).status, 404);
  assert.equal((await call('GET', '/api/employees/abc')).status, 400);
});

test('insights endpoints return USD-normalised statistics', async () => {
  const s = await call('GET', '/api/insights/summary?country=DE');
  assert.equal(s.json.headcount, 1);
  assert.equal(s.json.median, 86_400);

  const b = await call('GET', '/api/insights/breakdown?by=country');
  assert.ok(b.json.some((r: any) => r.key === 'IN'));

  assert.equal((await call('GET', '/api/insights/breakdown?by=salary')).status, 400);
  assert.equal((await call('GET', '/api/insights/outliers')).status, 200);
});

test('GET /api/meta lists filter options', async () => {
  const { json } = await call('GET', '/api/meta');
  assert.ok(json.departments.includes('Engineering'));
  assert.ok(json.currencies.includes('EUR'));
});

test('unknown routes are 404 JSON', async () => {
  const { status, json } = await call('GET', '/api/nope');
  assert.equal(status, 404);
  assert.ok(json.error);
});
