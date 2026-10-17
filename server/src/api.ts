import { existsSync, statSync, createReadStream } from 'node:fs';
import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { breakdown, isDimension, outliers, summary } from './analytics.ts';
import type { Filters } from './analytics.ts';
import type { Db } from './db.ts';
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from './errors.ts';
import { EmployeeRepository, SORT_COLUMNS } from './repository.ts';
import type { ListQuery, SortKey } from './repository.ts';
import { validateEmployee } from './validation.ts';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_PAGE_SIZE = 100;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const data = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
  });
  res.end(data);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new BadRequestError('Request body too large');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new BadRequestError('Request body must be valid JSON');
  }
}

function intParam(params: URLSearchParams, name: string, fallback: number, min: number, max: number): number {
  const raw = params.get(name);
  if (raw === null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new BadRequestError(`${name} must be an integer between ${min} and ${max}`);
  }
  return n;
}

export function parseListQuery(params: URLSearchParams): ListQuery {
  const sortBy = params.get('sortBy') ?? 'name';
  if (!Object.hasOwn(SORT_COLUMNS, sortBy)) throw new BadRequestError(`Unknown sortBy: ${sortBy}`);
  const order = params.get('order') ?? 'asc';
  if (order !== 'asc' && order !== 'desc') throw new BadRequestError('order must be asc or desc');
  return {
    q: params.get('q')?.trim() || undefined,
    country: params.get('country') || undefined,
    department: params.get('department') || undefined,
    jobTitle: params.get('jobTitle') || undefined,
    sortBy: sortBy as SortKey,
    order,
    page: intParam(params, 'page', 1, 1, 1_000_000),
    pageSize: intParam(params, 'pageSize', 25, 1, MAX_PAGE_SIZE),
  };
}

function parseFilters(params: URLSearchParams): Filters {
  return {
    country: params.get('country') || undefined,
    department: params.get('department') || undefined,
    jobTitle: params.get('jobTitle') || undefined,
  };
}

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new BadRequestError('Employee id must be a positive integer');
  return id;
}

function serveStatic(webDir: string, pathname: string, res: ServerResponse): boolean {
  const root = resolve(webDir);
  const requested = resolve(join(root, normalize(decodeURIComponent(pathname))));
  // Refuse anything that escapes the web root (path traversal).
  if (requested !== root && !requested.startsWith(root + sep)) return false;

  let file = requested;
  if (!existsSync(file) || statSync(file).isDirectory()) {
    // Single-page app: unknown paths fall back to index.html.
    file = join(root, 'index.html');
    if (!existsSync(file)) return false;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
  return true;
}

/** Builds the HTTP handler. Pass `webDir` to also serve the built UI. */
export function createApp(db: Db, options: { webDir?: string } = {}): RequestListener {
  const repo = new EmployeeRepository(db);

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const method = req.method ?? 'GET';
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const params = url.searchParams;

    if (!path.startsWith('/api/')) {
      if (method === 'GET' && options.webDir && serveStatic(options.webDir, path, res)) return;
      throw new NotFoundError();
    }

    if (method === 'GET' && path === '/api/health') return sendJson(res, 200, { status: 'ok' });
    if (method === 'GET' && path === '/api/meta') return sendJson(res, 200, repo.meta());

    if (path === '/api/employees') {
      if (method === 'GET') return sendJson(res, 200, repo.list(parseListQuery(params)));
      if (method === 'POST') {
        const created = repo.create(validateEmployee(await readJson(req)));
        return sendJson(res, 201, created);
      }
    }

    const employeeMatch = /^\/api\/employees\/([^/]+)$/.exec(path);
    if (employeeMatch) {
      const id = parseId(employeeMatch[1]);
      if (method === 'GET') return sendJson(res, 200, repo.get(id));
      if (method === 'PUT') return sendJson(res, 200, repo.update(id, validateEmployee(await readJson(req))));
      if (method === 'DELETE') {
        repo.delete(id);
        return sendJson(res, 204, undefined);
      }
    }

    if (method === 'GET' && path === '/api/insights/summary') {
      return sendJson(res, 200, summary(db, parseFilters(params)));
    }
    if (method === 'GET' && path === '/api/insights/breakdown') {
      const by = params.get('by') ?? '';
      if (!isDimension(by)) throw new BadRequestError('by must be one of: country, department, jobTitle');
      return sendJson(res, 200, breakdown(db, by, parseFilters(params)));
    }
    if (method === 'GET' && path === '/api/insights/outliers') {
      const limit = intParam(params, 'limit', 50, 1, 500);
      return sendJson(res, 200, outliers(db, { limit }));
    }

    throw new NotFoundError();
  }

  return (req, res) => {
    route(req, res).catch((err: unknown) => {
      if (res.headersSent) return res.end();
      if (err instanceof ValidationError) return sendJson(res, 400, { error: err.message, fields: err.fields });
      if (err instanceof BadRequestError) return sendJson(res, 400, { error: err.message });
      if (err instanceof NotFoundError) return sendJson(res, 404, { error: err.message });
      if (err instanceof ConflictError) return sendJson(res, 409, { error: err.message });
      console.error(err);
      return sendJson(res, 500, { error: 'Internal server error' });
    });
  };
}
