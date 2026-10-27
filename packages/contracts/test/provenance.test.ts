import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import type { HttpHandler } from 'msw/http';

import { createMockHandlers, generateHandlers, DEFAULT_API_ORIGIN } from '../src/handlers.js';
import type { JsonObject, OperationView } from '../src/openapi-document.js';
import { analyzeContract } from '../src/openapi-document.js';
import { contractDocuments } from '../src/node-adapter.js';
import { asRecord, asRecordList, expectOk, requestJson } from './harness.js';

/**
 * Provenance: the handlers an app ships came from these files, and only from
 * these files. If any of this fails, `generated/` is stale or something has
 * started hand-writing mocks.
 */
const require = createRequire(import.meta.url);
const MANIFEST_URL = new URL('../generated/manifest.json', import.meta.url);
const sha256 = (contents: string): string => createHash('sha256').update(contents).digest('hex');

/**
 * How `@msw/source` identifies a handler it built, read from its own source: it
 * calls `new HttpHandler(method, requestUrl, resolver)` where
 *
 * - `method` is the Path Item key verbatim, so `info.method` is lower-case
 *   (`"get"`), while MSW itself matches the method case-insensitively;
 * - `requestUrl` is `new URL(servers[n].url + normalizeSwaggerUrl(path)).href`,
 *   so `info.path` is an absolute URL — origin included — whose parameters are
 *   already rewritten from `{jobId}` to `:jobId`.
 *
 * Both facts are why a naive `info.path` versus authored-path comparison cannot
 * work: the document holds `/api/v1/positions/export/{jobId}` and the handler
 * holds `http://localhost:8787/api/v1/positions/export/:jobId`. `OperationView`
 * from `src/openapi-document.ts` resolves the same two things — `method` plus the
 * `url` built from the servers block — so the key below is the honest meeting
 * point, with the method case normalised rather than assumed.
 */
function handlerKeyOf(handler: HttpHandler): string {
  return `${String(handler.info.method).toUpperCase()} ${String(handler.info.path)}`;
}

/** The same key for one operation read out of a parsed document. */
function operationKeyOf(operation: OperationView): string {
  return `${operation.method.toUpperCase()} ${operation.url}`;
}

interface Manifest {
  schemaVersion: string;
  generator: { script: string; runtime: string; packages: Record<string, string> };
  inputs: Array<{ path: string; sha256: string; bytes: number; openapi: string; title: string; operations: number; documentedResponses: number; generatedHandlers: number }>;
  outputs: Array<{ path: string; sha256: string; bytes: number }>;
  componentMetadata: { status: string; path: string; reason?: string };
  provenance: string;
}

const manifestPath = fileURLToPath(MANIFEST_URL);
const manifest: Manifest = existsSync(manifestPath)
  ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest)
  : (() => {
      throw new Error(`generated/manifest.json is missing. Run "pnpm --filter @designharness/contracts codegen" before the tests.`);
    })();

let harnessDocuments: readonly JsonObject[] = [];

beforeAll(() => {
  harnessDocuments = contractDocuments();
});

afterAll(() => {
  expect(harnessDocuments).toHaveLength(2);
});

describe('generated manifest', () => {
  it('names both OpenAPI documents as the inputs', () => {
    expect(manifest.inputs.map((input) => input.path)).toEqual([
      'packages/contracts/openapi/data-table.json',
      'packages/contracts/openapi/combobox.json',
    ]);
  });

  it('still matches the contracts on disk, byte for byte', () => {
    for (const input of manifest.inputs) {
      const absolute = new URL(`../../../${input.path}`, import.meta.url);
      const contents = readFileSync(absolute, 'utf8');
      expect(sha256(contents), `${input.path} changed without regenerating`).toBe(input.sha256);
      expect(Buffer.byteLength(contents)).toBe(input.bytes);
      expect(input.openapi).toMatch(/^3\.1\./);
    }
  });

  it('records the toolchain the handlers were generated with', () => {
    expect(manifest.generator['packages']['@msw/source']).toBe(require('@msw/source/package.json').version as string);
    expect(manifest.generator['packages']['msw']).toBe(require('msw/package.json').version as string);
    expect(manifest.provenance).toMatch(/fromOpenApi/);
    expect(manifest.outputs.map((output) => output.path)).toEqual(
      expect.arrayContaining(['packages/contracts/generated/handlers.mjs']),
    );
  });

  it('refuses to claim component metadata it did not produce', () => {
    const metadataFile = new URL('../generated/component-metadata.json', import.meta.url);
    if (manifest.componentMetadata.status === 'skipped') {
      expect(existsSync(fileURLToPath(metadataFile))).toBe(false);
      expect(manifest.componentMetadata.reason).toBeTruthy();
    } else {
      expect(manifest.componentMetadata.status).toBe('generated');
      expect(existsSync(fileURLToPath(metadataFile))).toBe(true);
    }
  });
});

describe('single-source generation', () => {
  it('generates exactly one handler per documented response', async () => {
    const documents = contractDocuments();
    const generated = await generateHandlers(documents);
    const documentedResponses = documents
      .map((document) => analyzeContract(document))
      .reduce((total, model) => total + model.operations.reduce((sum, operation) => sum + operation.documentedStatuses.size, 0), 0);
    expect(generated).toHaveLength(documentedResponses);
    expect(generated.length).toBe(manifest.inputs.reduce((total, input) => total + input.generatedHandlers, 0));
  });

  it('covers every documented operation with a handler', async () => {
    const documents = contractDocuments();
    const generated = await generateHandlers(documents);
    const models = documents.map((document) => analyzeContract(document));
    const operations = models.flatMap((model) => model.operations);

    const handlerKeys = generated.map(handlerKeyOf);
    const covered = new Map<string, number>();
    for (const key of handlerKeys) {
      covered.set(key, (covered.get(key) ?? 0) + 1);
    }

    // Every operation the documents declare is answered, and answered by exactly
    // one handler per response status it documents.
    const operationKeys = new Set<string>();
    for (const operation of operations) {
      const key = operationKeyOf(operation);
      operationKeys.add(key);
      expect(covered.has(key), `${operation.operationId}: no generated handler answers ${key}`).toBe(true);
      expect(covered.get(key), `${operation.operationId} serves one handler per documented response`).toBe(operation.documentedStatuses.size);
    }

    // Nothing is generated that the documents did not ask for: the handler set and
    // the operation set are the same set, so a hand-written or stale handler would
    // show up here rather than only in a response body.
    for (const key of covered.keys()) {
      expect(operationKeys.has(key), `a handler answers ${key}, which no contract documents`).toBe(true);
    }
    expect(covered.size).toBe(operationKeys.size);
    expect(handlerKeys.length).toBe(operations.reduce((total, operation) => total + operation.documentedStatuses.size, 0));
  });

  it('matches handlers by the absolute URL the servers block produces', async () => {
    // `fromOpenApi` resolves each path against `servers[].url` and passes the
    // Path Item key as the method, so `info.path` is an absolute URL and
    // `info.method` is lower-case. The harness compares against that shape: a
    // path-only key would match any origin, and an exact-case key would match
    // nothing. If @msw/source ever changes either, this fails here first.
    const documents = contractDocuments();
    const generated = await generateHandlers(documents);
    expect(generated.length).toBeGreaterThan(0);
    for (const handler of generated) {
      expect(typeof handler.info.path, 'the generated handler matches a URL, not a bare path').toBe('string');
      expect(new URL(String(handler.info.path)).origin, `handler origin for ${String(handler.info.path)}`).toBe(new URL(DEFAULT_API_ORIGIN).origin);
      expect(String(handler.info.method)).toBe(String(handler.info.method).toLowerCase());
    }
  });

  it('emits a generated module that produces the same handler set', async () => {
    const generatedModule = (await import('../generated/handlers.mjs')) as { createGeneratedHandlers: () => Promise<readonly HttpHandler[]> };
    const fromArtifact = await generatedModule.createGeneratedHandlers();
    const fromSource = await generateHandlers(contractDocuments());
    expect(fromArtifact.map(handlerKeyOf)).toEqual(fromSource.map(handlerKeyOf));
  });

  it('changes the served data when the contract changes, and only then', async () => {
    const baseline = await requestJsonThrough(contractDocuments(), '/api/v1/positions', { pageSize: 100 });
    expect(baseline.total).toBe(24);

    const edited = structuredClone(contractDocuments()) as [JsonObject, JsonObject];
    const collection = asRecord(asRecord(asRecord(edited[0]['components'], 'components')['examples'], 'examples')['PositionsCollection'], 'PositionsCollection');
    const value = asRecord(collection['value'], 'value');
    const rows = asRecordList(value['data'], 'data');
    const template = rows[0];
    if (!template) {
      throw new Error('the contract declares no rows to copy');
    }
    value['data'] = [...rows, { ...template, id: '00000000-0000-4000-8000-000000000001', symbol: 'ZZTEST', name: 'Deliberately Edited Holding' }];

    const editedResult = await requestJsonThrough(edited, '/api/v1/positions', { pageSize: 100 });
    expect(editedResult.total).toBe(25);
    expect(editedResult.symbols).toContain('ZZTEST');
    expect(editedResult.symbols).not.toEqual(baseline.symbols);

    // The untouched contract still serves the untouched answer: the dataset the
    // mock reads is the document, nothing cached and nothing hand-written.
    const after = await requestJsonThrough(contractDocuments(), '/api/v1/positions', { pageSize: 100 });
    expect(after.total).toBe(24);
    expect(after.symbols).toEqual(baseline.symbols);
  });
});

/** Fetch one page through a freshly generated server for the given documents. */
async function requestJsonThrough(documents: readonly JsonObject[], path: string, query: Record<string, string | number>): Promise<{ total: number; symbols: string[] }> {
  const handlers = await createMockHandlers({ documents });
  const server = setupServer(...handlers);
  server.listen({ onUnhandledFrame: 'error' });
  try {
    const response = await requestJson(path, query);
    expectOk(response);
    const envelope = asRecord(response.body, 'envelope');
    const rows = asRecordList(envelope['data'], 'data');
    return { total: Number(asRecord(envelope['meta'], 'meta')['total']), symbols: rows.map((row) => String(row['symbol'])) };
  } finally {
    server.close();
  }
}
