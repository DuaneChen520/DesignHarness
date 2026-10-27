/**
 * The registry HTTP service — zero dependencies beyond `node:http`.
 *
 * A shadcn client resolves a remote registry in exactly three steps: it reads
 * `<url>/registry.json` (and `/index.json`, which some tooling tries first), then
 * `<url>/r/<name>.json` for every item and every `registryDependencies` name it collects,
 * then writes `files[].content` at `files[].path`. Serving that faithfully is the whole
 * job, so this server does nothing but read the built documents off disk: no framework,
 * no runtime dependency to age, and no second copy of the registry that could drift from
 * the one the build validated.
 *
 * Two harness-specific routes sit alongside the protocol:
 *   GET  /DESIGN.md  — the Intent SSOT (RESEARCH.md §8.4), so an agent pointed at the
 *                      registry also gets the design philosophy and the Do's and Don'ts.
 *   POST /sync       — copies DESIGN.md into a downstream project root, the same
 *                      operation `designharness registry serve --sync-to <dir>` performs
 *                      at boot.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { registryItemsDirName, registryOutputDir, designMarkdownPath, toRelative } from './paths.js';
import type { RegistryIndex } from '@designharness/engine';

export interface RegistryServerOptions {
  /** Directory holding `registry.json` and `r/`. Defaults to the built output. */
  readonly registryDir?: string;
  /** Intent file served at `/DESIGN.md`. */
  readonly designMarkdown?: string;
  readonly host?: string;
  /** `0` binds an ephemeral port — what the tests use. */
  readonly port?: number;
  /** Copy DESIGN.md into these project roots as soon as the server is listening. */
  readonly syncTo?: readonly string[];
  /** Allow `/sync` (and `--sync-to`) to replace an existing downstream DESIGN.md. */
  readonly force?: boolean;
  /** Suppress the per-request access log. */
  readonly quiet?: boolean;
}

export interface RunningRegistryServer {
  readonly server: Server;
  readonly host: string;
  readonly port: number;
  readonly origin: string;
  readonly registryDir: string;
  close(): Promise<void>;
}

export interface SyncResult {
  readonly source: string;
  readonly target: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly overwritten: boolean;
}

const JSON_TYPE = 'application/json; charset=utf-8';
const MARKDOWN_TYPE = 'text/markdown; charset=utf-8';
/** Artifacts are content-addressed by the build, so a client may revalidate cheaply. */
const CACHE_CONTROL = 'public, max-age=0, must-revalidate';
const ITEM_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

interface CachedDocument {
  readonly contents: string;
  readonly etag: string;
  readonly bytes: number;
}

/** Read a JSON document from the built registry, `undefined` when it is not there. */
async function readJson(absolutePath: string): Promise<CachedDocument | undefined> {
  if (!existsSync(absolutePath)) return undefined;
  const contents = await readFile(absolutePath, 'utf8');
  return { contents, etag: `"${createHash('sha256').update(contents).digest('hex').slice(0, 32)}"`, bytes: Buffer.byteLength(contents) };
}

function send(response: ServerResponse, status: number, body: string, contentType: string, etag?: string, cacheControl = CACHE_CONTROL): void {
  const headers: Record<string, string> = {
    'content-type': contentType,
    'cache-control': cacheControl,
    'x-content-type-options': 'nosniff',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,HEAD,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
  };
  if (etag !== undefined) headers['etag'] = etag;
  if (response.req?.method === 'HEAD') {
    response.writeHead(status, headers);
    response.end();
    return;
  }
  response.writeHead(status, headers);
  response.end(body);
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  send(response, status, `${JSON.stringify(payload, null, 2)}\n`, JSON_TYPE);
}

function notFound(response: ServerResponse, url: URL, known: readonly string[]): void {
  sendJson(response, 404, {
    error: 'not_found',
    message: `no registry document at ${url.pathname}`,
    registryHas: known,
    hint: 'GET /registry.json for the index, /r/<name>.json for an item, /_index?q=<term> to search',
  });
}

/** Every item name the registry currently serves, for the 404 body and `/._index`. */
async function knownItems(registryDir: string): Promise<string[]> {
  const index = await readJson(join(registryDir, 'registry.json'));
  if (index !== undefined) {
    try {
      const parsed = JSON.parse(index.contents) as RegistryIndex;
      if (Array.isArray(parsed.items)) return parsed.items.map((item) => item.name);
    } catch {
      // fall through to the directory listing
    }
  }
  if (!existsSync(join(registryDir, registryItemsDirName))) return [];
  const entries = await readdir(join(registryDir, registryItemsDirName));
  return entries.filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -'.json'.length)).sort();
}

/** `/_index` — the human/agent-facing search over the built index. */
async function search(registryDir: string, url: URL): Promise<{ status: number; body: unknown }> {
  const document = await readJson(join(registryDir, 'registry.json'));
  if (document === undefined) {
    return {
      status: 404,
      body: { error: 'registry_not_built', message: `${toRelative(join(registryDir, 'registry.json'))} is missing`, hint: 'run: pnpm --filter @designharness/registry build' },
    };
  }
  const index = JSON.parse(document.contents) as RegistryIndex;
  const query = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const type = url.searchParams.get('type');
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') ?? '50') || 50, 200));

  const matches = index.items
    .filter((item) => (type === null || type === '' || item.type === type) && (query.length === 0 || `${item.name} ${item.title ?? ''} ${item.description ?? ''}`.toLowerCase().includes(query)))
    .slice(0, limit);

  return {
    status: 200,
    body: {
      registry: index.name ?? 'meridian',
      homepage: index.homepage ?? null,
      query: url.searchParams.get('q') ?? '',
      type: type ?? 'all',
      totalItems: index.totalItems,
      matched: matches.length,
      items: matches.map((item) => ({ ...item, url: `/r/${item.name}.json`, itemUrl: `/${item.name}.json` })),
    },
  };
}

/**
 * Copy the workspace `DESIGN.md` into a downstream project root (RESEARCH.md §8.4).
 *
 * Refuses to overwrite an existing file unless `force` is set: a project's DESIGN.md is
 * hand-authored the moment someone edits it, and a registry service must not silently
 * delete that work.
 */
export async function syncDesignMarkdown(targetRoot: string, options: { readonly source?: string; readonly force?: boolean } = {}): Promise<SyncResult> {
  const source = options.source ?? designMarkdownPath;
  if (!existsSync(source)) throw new Error(`the Intent SSOT is missing: ${source}`);
  if (!isAbsolute(targetRoot)) throw new Error(`--sync-to expects an absolute project root, got "${targetRoot}"`);

  const targetDirectory = resolve(targetRoot);
  if (!existsSync(targetDirectory)) await mkdir(targetDirectory, { recursive: true });
  const targetStat = await stat(targetDirectory);
  if (!targetStat.isDirectory()) throw new Error(`--sync-to target is not a directory: ${targetDirectory}`);

  const contents = await readFile(source, 'utf8');
  const target = join(targetDirectory, 'DESIGN.md');
  const overwritten = existsSync(target);
  if (overwritten && options.force !== true) {
    throw new Error(`${target} already exists — pass --force to replace it (a downstream DESIGN.md may carry hand edits)`);
  }
  await writeFile(target, contents, 'utf8');
  return { source: toRelative(source), target, bytes: Buffer.byteLength(contents), sha256: createHash('sha256').update(contents).digest('hex'), overwritten };
}

/** The request handler, exported separately so tests can drive it without a socket. */
export function createRegistryHandler(options: RegistryServerOptions = {}) {
  const registryDir = options.registryDir ?? registryOutputDir;
  const designMd = options.designMarkdown ?? designMarkdownPath;

  return async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const method = request.method ?? 'GET';
    const raw = request.url ?? '/';
    const url = new URL(raw, 'http://localhost');
    const path = decodeURIComponent(url.pathname);

    if (method === 'OPTIONS') {
      send(response, 204, '', JSON_TYPE);
      return;
    }

    if (path === '/_index') {
      if (method !== 'GET' && method !== 'HEAD') {
        sendJson(response, 405, { error: 'method_not_allowed', message: '/_index only accepts GET' });
        return;
      }
      const result = await search(registryDir, url);
      sendJson(response, result.status, result.body);
      return;
    }

    if (path === '/sync') {
      if (method !== 'POST') {
        sendJson(response, 405, { error: 'method_not_allowed', message: 'DESIGN.md sync is a POST to /sync with {"target":"<project root>","force":true|false}' });
        return;
      }
      const body = await readBody(request);
      const parsed = body.length === 0 ? {} : (JSON.parse(body) as Record<string, unknown>);
      const target = typeof parsed.target === 'string' ? parsed.target : (url.searchParams.get('target') ?? '');
      const force = typeof parsed.force === 'boolean' ? parsed.force : url.searchParams.get('force') === 'true';
      if (target.length === 0) {
        sendJson(response, 400, { error: 'target_required', message: 'POST /sync expects {"target":"/abs/path/to/project"}' });
        return;
      }
      try {
        const result = await syncDesignMarkdown(target, { source: designMd, force });
        sendJson(response, result.overwritten ? 200 : 201, { ok: true, ...result });
      } catch (error) {
        sendJson(response, 409, { error: 'sync_failed', message: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (path === '/DESIGN.md' || path === '/design.md') {
      if (method !== 'GET' && method !== 'HEAD') {
        sendJson(response, 405, { error: 'method_not_allowed', message: 'DESIGN.md only accepts GET' });
        return;
      }
      if (!existsSync(designMd)) {
        sendJson(response, 404, { error: 'intent_missing', message: `${designMd} does not exist in this workspace` });
        return;
      }
      const contents = await readFile(designMd, 'utf8');
      const etag = `"${createHash('sha256').update(contents).digest('hex').slice(0, 32)}"`;
      if (request.headers['if-none-match'] === etag) {
        send(response, 304, '', MARKDOWN_TYPE, etag);
        return;
      }
      send(response, 200, contents, MARKDOWN_TYPE, etag);
      return;
    }

    if (method !== 'GET' && method !== 'HEAD') {
      sendJson(response, 405, { error: 'method_not_allowed', message: `${method} is not supported on ${path}` });
      return;
    }

    // The index, under each of the three names a client may ask for.
    if (path === '/' || path === '/registry.json' || path === '/index.json' || path === '/registry/index.json') {
      const document = await readJson(join(registryDir, path === '/' ? 'registry.json' : path.replace(/^\/registry\//, '')));
      if (document === undefined) {
        sendJson(response, 404, {
          error: 'registry_not_built',
          message: `${join(registryDir, 'registry.json')} is missing`,
          hint: 'run: pnpm --filter @designharness/registry build (or: designharness registry build)',
        });
        return;
      }
      if (request.headers['if-none-match'] === document.etag) {
        send(response, 304, '', JSON_TYPE, document.etag);
        return;
      }
      send(response, 200, document.contents, JSON_TYPE, document.etag);
      return;
    }

    const itemMatch = /^\/(?:r\/)?([A-Za-z0-9._-]+)\.json$/.exec(path);
    if (itemMatch?.[1] !== undefined) {
      const name = itemMatch[1];
      if (!ITEM_NAME.test(name)) {
        notFound(response, url, await knownItems(registryDir));
        return;
      }
      const document = await readJson(join(registryDir, registryItemsDirName, `${name}.json`));
      if (document === undefined) {
        notFound(response, url, await knownItems(registryDir));
        return;
      }
      if (request.headers['if-none-match'] === document.etag) {
        send(response, 304, '', JSON_TYPE, document.etag);
        return;
      }
      send(response, 200, document.contents, JSON_TYPE, document.etag);
      return;
    }

    notFound(response, url, await knownItems(registryDir));
  };
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      if (Buffer.concat(chunks).length > 64 * 1024) rejectBody(new Error('request body too large'));
    });
    request.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    request.on('error', rejectBody);
  });
}

/** Create the server without binding a socket. */
export function createRegistryServer(options: RegistryServerOptions = {}): Server {
  const handler = createRegistryHandler(options);
  const server = createServer((request, response) => {
    if (options.quiet !== true) {
      response.on('finish', () => {
        console.log(`[registry] ${request.method ?? 'GET'} ${request.url ?? '/'} ${String(response.statusCode)} ${String(response.getHeader('content-type') ?? '')}`);
      });
    }
    handler(request, response).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!response.headersSent) sendJson(response, 500, { error: 'registry_error', message });
      else response.end();
      if (options.quiet === true) console.error(`[registry] ${request.method ?? 'GET'} ${request.url ?? '/'} -> 500 ${message}`);
    });
  });
  return server;
}

/** Bind, optionally sync DESIGN.md to downstream roots, and report the ephemeral port. */
export async function startRegistryServer(options: RegistryServerOptions = {}): Promise<RunningRegistryServer> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 4870;
  const registryDir = options.registryDir ?? registryOutputDir;
  const server = createRegistryServer({ ...options, registryDir });

  await new Promise<void>((start, fail) => {
    server.once('error', fail);
    server.listen(port, host, () => {
      server.removeListener('error', fail);
      start();
    });
  });

  const address = server.address();
  const boundPort = typeof address === 'object' && address !== null ? address.port : port;

  for (const target of options.syncTo ?? []) {
    const result = await syncDesignMarkdown(target, { source: options.designMarkdown ?? designMarkdownPath, force: options.force });
    if (options.quiet !== true) console.log(`[registry] synced DESIGN.md -> ${result.target} (${String(result.bytes)} bytes, ${result.overwritten ? 'replaced' : 'created'})`);
  }

  return {
    server,
    host,
    port: boundPort,
    origin: `http://${host}:${String(boundPort)}`,
    registryDir,
    close: () =>
      new Promise<void>((closed, failed) => {
        server.close((error) => (error === undefined ? closed() : failed(error)));
      }),
  };
}

/** The serve command line, parsed into a mutable options object before it is handed over. */
interface MutableServeOptions {
  registryDir?: string;
  designMarkdown?: string;
  host?: string;
  port?: number;
  syncTo?: string[];
  force?: boolean;
  quiet?: boolean;
}

/** Parse the `serve` command line: `--port`, `--host`, `--registry-dir`, `--sync-to`, `--force`, `--quiet`. */
export function parseServeArgs(argv: readonly string[]): RegistryServerOptions & { readonly unknown: readonly string[] } {
  const options: MutableServeOptions = {};
  const unknown: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = (): string => {
      index += 1;
      const value = argv[index];
      if (value === undefined) throw new Error(`${String(arg)} expects a value`);
      return value;
    };
    if (arg === '--port' || arg === '-p') options.port = Number.parseInt(next(), 10);
    else if (arg === '--host') options.host = next();
    else if (arg === '--registry-dir') options.registryDir = resolve(next());
    else if (arg === '--design-md') options.designMarkdown = resolve(next());
    else if (arg === '--sync-to') options.syncTo = [...(options.syncTo ?? []), next()];
    else if (arg === '--force' || arg === '--clobber') options.force = true;
    else if (arg === '--quiet' || arg === '--silent') options.quiet = true;
    else unknown.push(String(arg));
  }
  if (options.port !== undefined && !Number.isInteger(options.port)) throw new Error('--port must be an integer');
  return { ...options, unknown };
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  const options = parseServeArgs(process.argv.slice(2));
  if (options.unknown.length > 0) {
    console.error(`[registry] unknown argument(s): ${options.unknown.join(' ')}`);
    process.exit(2);
  }
  if (options.registryDir !== undefined && !existsSync(join(options.registryDir, 'registry.json'))) {
    console.error(`[registry] ${options.registryDir} holds no registry.json — run: pnpm --filter @designharness/registry build`);
    process.exit(1);
  }
  const running = await startRegistryServer(options);
  const servedDir = options.registryDir ?? registryOutputDir;
  console.log(`[registry] serving ${toRelative(servedDir)} at ${running.origin}`);
  console.log(`[registry]   ${running.origin}/registry.json  ${running.origin}/r/<name>.json  ${running.origin}/_index?q=table  ${running.origin}/DESIGN.md`);
  const shutdown = () => {
    void running.close().then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
