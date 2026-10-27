/**
 * The service is exercised over a real socket: the fixture registry is built into a temp
 * directory, `startRegistryServer` binds port 0, and the assertions are `fetch` responses.
 * Everything the shadcn CLI depends on — status codes, `application/json`, cache
 * revalidation, `/r/<name>.json` and the `/<name>.json` alias — is checked on the wire.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RegistryIndex } from '@designharness/engine';
import { parseServeArgs, startRegistryServer } from '../src/server.js';
import type { RunningRegistryServer } from '../src/server.js';
import { designMarkdownPath, uiSourceRoot } from '../src/paths.js';
import { buildFixture } from './fixture.js';
import type { RegistryFixture } from './fixture.js';

let fixture: RegistryFixture;
let server: RunningRegistryServer;
let target: string;

beforeAll(async () => {
  fixture = await buildFixture();
  target = await mkdtemp(join(tmpdir(), 'designharness-downstream-'));
  server = await startRegistryServer({ registryDir: fixture.dir, port: 0, host: '127.0.0.1', quiet: true });
});

afterAll(async () => {
  await server.close();
  await fixture.cleanup();
});

const url = (path: string): string => `${server.origin}${path}`;

describe('the index', () => {
  it('serves registry.json and index.json identically', async () => {
    for (const path of ['/registry.json', '/index.json', '/', '/registry/index.json']) {
      const response = await fetch(url(path));
      expect(response.status, path).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
      expect(response.headers.get('cache-control')).toContain('must-revalidate');
      const body = (await response.json()) as RegistryIndex;
      expect(body.items.length).toBeGreaterThan(0);
      expect(body.totalItems).toBe(body.items.length);
    }
    const primary = await (await fetch(url('/registry.json'))).text();
    const alias = await (await fetch(url('/index.json'))).text();
    expect(alias).toBe(primary);
    expect(primary).toBe(await fixture.read('registry.json'));
  });

  it('revalidates with an ETag instead of resending the body', async () => {
    const first = await fetch(url('/registry.json'));
    const etag = first.headers.get('etag');
    expect(etag).toMatch(/^"[0-9a-f]{32}"$/);
    const second = await fetch(url('/registry.json'), { headers: { 'if-none-match': etag ?? '' } });
    expect(second.status).toBe(304);
    expect(await second.text()).toBe('');
  });

  it('searches the index through /_index', async () => {
    const all = (await (await fetch(url('/_index'))).json()) as { totalItems: number; matched: number; items: { name: string; url: string }[] };
    expect(all.matched).toBe(all.totalItems);
    expect(all.items[0]?.url).toMatch(/^\/r\//);

    const table = (await (await fetch(url('/_index?q=table'))).json()) as { matched: number; items: { name: string }[] };
    expect(table.items.map((item) => item.name)).toContain('data-table');

    const bases = (await (await fetch(url('/_index?type=registry:base'))).json()) as { items: { name: string; type: string }[] };
    expect(bases.items.map((item) => item.name)).toEqual(['meridian-base']);

    const nothing = (await (await fetch(url('/_index?q=zzzz-no-such-thing'))).json()) as { matched: number };
    expect(nothing.matched).toBe(0);
  });
});

describe('items', () => {
  it('serves /r/<name>.json and the /<name>.json alias with the same bytes', async () => {
    const direct = await (await fetch(url('/r/button.json'))).text();
    const alias = await (await fetch(url('/button.json'))).text();
    expect(alias).toBe(direct);
    expect(direct).toBe(await fixture.read('r/button.json'));
    const parsed = JSON.parse(direct) as { name: string; files: { path: string; content: string }[] };
    expect(parsed.name).toBe('button');
    expect(parsed.files[0]?.content).toBe(await readFile(join(uiSourceRoot, 'button.tsx'), 'utf8'));
  });

  it('answers a HEAD without a body', async () => {
    const response = await fetch(url('/r/meridian-base.json'), { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(await response.text()).toBe('');
  });

  it('404s an unknown item as JSON and lists what does exist', async () => {
    const response = await fetch(url('/r/not-a-component.json'));
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    const body = (await response.json()) as { error: string; registryHas: string[] };
    expect(body.error).toBe('not_found');
    expect(body.registryHas).toContain('button');
  });

  it('404s a traversal attempt', async () => {
    const response = await fetch(url('/r/..%2f..%2fregistry.json'));
    expect([404, 400]).toContain(response.status);
  });
});

describe('DESIGN.md delivery (RESEARCH.md §8.4)', () => {
  it('serves the intent file as markdown', async () => {
    const response = await fetch(url('/DESIGN.md'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(await response.text()).toBe(await readFile(designMarkdownPath, 'utf8'));
  });

  it('copies the intent file into a downstream project root', async () => {
    const response = await fetch(url('/sync'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ target }) });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { ok: boolean; target: string; bytes: number };
    expect(body.ok).toBe(true);
    expect(existsSync(join(target, 'DESIGN.md'))).toBe(true);
    expect(await readFile(join(target, 'DESIGN.md'), 'utf8')).toBe(await readFile(designMarkdownPath, 'utf8'));

    // The second sync must not silently clobber a file the downstream may have edited.
    const conflict = await fetch(url('/sync'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ target }) });
    expect(conflict.status).toBe(409);
    expect((await conflict.json()) as { error: string }).toEqual(expect.objectContaining({ error: 'sync_failed' }));

    await writeFile(join(target, 'DESIGN.md'), '# edited downstream\n', 'utf8');
    const forced = await fetch(url('/sync'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ target, force: true }) });
    expect(forced.status).toBe(200);
    expect(await readFile(join(target, 'DESIGN.md'), 'utf8')).toBe(await readFile(designMarkdownPath, 'utf8'));
  });

  it('rejects a relative sync target and a GET on /sync', async () => {
    const bad = await fetch(url('/sync'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ target: 'relative/path' }) });
    expect(bad.status).toBe(409);
    const wrongMethod = await fetch(url('/sync'));
    expect(wrongMethod.status).toBe(405);
    const missingTarget = await fetch(url('/sync'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(missingTarget.status).toBe(400);
  });
});

describe('server plumbing', () => {
  it('reports a clear error when the registry has not been built', async () => {
    const empty = await startRegistryServer({ registryDir: join(target, 'nope'), port: 0, host: '127.0.0.1', quiet: true });
    const response = await fetch(`${empty.origin}/registry.json`);
    expect(response.status).toBe(404);
    expect((await response.json()) as { error: string }).toEqual(expect.objectContaining({ error: 'registry_not_built' }));
    await empty.close();
  });

  it('parses the serve flags the CLI and `pnpm serve` pass', () => {
    const parsed = parseServeArgs(['--port', '5000', '--host', '0.0.0.0', '--sync-to', '/tmp/a', '--sync-to', '/tmp/b', '--force', '--quiet']);
    expect(parsed.port).toBe(5000);
    expect(parsed.host).toBe('0.0.0.0');
    expect(parsed.syncTo).toEqual(['/tmp/a', '/tmp/b']);
    expect(parsed.force).toBe(true);
    expect(parsed.quiet).toBe(true);
    expect(parsed.unknown).toEqual([]);
    expect(() => parseServeArgs(['--port', 'abc'])).toThrowError(/integer/);
    expect(parseServeArgs(['--nonsense']).unknown).toEqual(['--nonsense']);
  });

  it('syncs DESIGN.md at boot when --sync-to is given', async () => {
    const bootTarget = await mkdtemp(join(tmpdir(), 'designharness-boot-sync-'));
    const booted = await startRegistryServer({ registryDir: fixture.dir, port: 0, host: '127.0.0.1', quiet: true, syncTo: [bootTarget] });
    expect(existsSync(join(bootTarget, 'DESIGN.md'))).toBe(true);
    await booted.close();
  });
});
