import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { HarnessMockServer } from '../src/node-adapter.js';
import { setupMockServer } from '../src/node-adapter.js';
import type { ContractModel } from '../src/openapi-document.js';
import { errorSchema } from '../src/schemas.js';
import { contractUrl } from '../src/handlers.js';
import { asRecord, expectConformsToContract, requestJson, requestRaw } from './harness.js';

/**
 * Every rejection below is the contract's own response object for a status it
 * documents, served by `@msw/source`. The harness only decides *which*
 * documented status applies; it never writes an error body, and this file is how
 * we know that.
 */
let harness: HarnessMockServer;
let dataTable: ContractModel;
let combobox: ContractModel;

beforeAll(async () => {
  harness = await setupMockServer();
  const [positions, instruments] = harness.models;
  if (!positions || !instruments) {
    throw new Error('the harness expects two contract documents; the package root changed');
  }
  dataTable = positions;
  combobox = instruments;
});

afterAll(() => {
  harness.close();
});

describe('rejections the contract owns', () => {
  it('answers an impossible page with the documented 422', async () => {
    const response = await requestJson('/api/v1/positions', { page: 9, pageSize: 10 });
    expect(response.status).toBe(422);
    expectConformsToContract(response.body, dataTable, 'listPositions', '422');
    expect(errorSchema.safeParse(response.body).success).toBe(true);
    expect(asRecord(response.body, 'error')['code']).toBe('page_out_of_range');
    // The body is literally the contract's declared 422 example.
    const declared = dataTable.operations.find((operation) => operation.operationId === 'listPositions')?.mediaOf('422');
    expect(response.body).toEqual(declared?.example);
  });

  it('answers a value outside its declared schema with the documented 400', async () => {
    // Each case breaks one declared constraint: `page` its minimum, `pageSize` its
    // maximum, `sortOrder` and `accountType` their enums, `sortBy` the enum of
    // sortable columns the contract publishes (`id` is deliberately not in it).
    const outOfSchema: readonly Readonly<Record<string, string | number>>[] = [{ page: 0 }, { pageSize: 500 }, { sortOrder: 'sideways' }, { accountType: 'offshore' }, { sortBy: 'id' }];
    for (const query of outOfSchema) {
      const response = await requestJson('/api/v1/positions', query);
      expect(response.status, JSON.stringify(query)).toBe(400);
      expectConformsToContract(response.body, dataTable, 'listPositions', '400');
      expect(asRecord(response.body, 'error')['code']).toBe('invalid_parameter');
    }
  });

  it('answers an unknown record id with the documented 404', async () => {
    const instrument = await requestJson('/api/v1/instruments/11111111-1111-4111-8111-111111111111');
    expect(instrument.status).toBe(404);
    expectConformsToContract(instrument.body, combobox, 'getInstrument', '404');
    expect(asRecord(instrument.body, 'error')['code']).toBe('not_found');

    const job = await requestJson('/api/v1/positions/export/22222222-2222-4222-8222-222222222222');
    expect(job.status).toBe(404);
    expectConformsToContract(job.body, dataTable, 'getExportJob', '404');
  });

  it('validates an export request body against the schema the contract declares', async () => {
    const rejected = await requestRaw(contractUrl('/api/v1/positions/export'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ format: 'pdf' }),
    });
    expect(rejected.status).toBe(400);
    expectConformsToContract(rejected.body, dataTable, 'exportPositions', '400');

    const accepted = await requestRaw(contractUrl('/api/v1/positions/export'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ format: 'csv', accountType: 'hedge' }),
    });
    expect(accepted.status).toBe(202);
    expectConformsToContract(accepted.body, dataTable, 'exportPositions', '202');
    expect(accepted.body).toEqual(
      dataTable.operations.find((operation) => operation.operationId === 'exportPositions')?.mediaOf('202')?.example,
    );

    const missingBody = await requestRaw(contractUrl('/api/v1/positions/export'), { method: 'POST' });
    expect(missingBody.status).toBe(400);
  });

  it('serves any documented failure on demand, including 500', async () => {
    for (const status of ['400', '404', '422', '500'] as const) {
      const response = await requestJson('/api/v1/positions', { response: status });
      expect(response.status).toBe(Number(status));
      expectConformsToContract(response.body, dataTable, 'listPositions', status);
      expect(errorSchema.safeParse(response.body).success).toBe(true);
    }
  });

  it('only ever answers with a status the operation documents', async () => {
    const list = dataTable.operations.find((operation) => operation.operationId === 'listPositions');
    const documented = list?.documentedStatuses;
    expect(documented).toBeDefined();
    expect([...(documented ?? [])].sort()).toEqual(['200', '400', '404', '422', '500']);

    for (const status of [200, 400, 404, 422, 500]) {
      const response = await requestJson('/api/v1/positions', { response: String(status) });
      expect(response.status).toBe(status);
    }

    // A status the contract does not name cannot be produced: there is no
    // handler and no branch that would answer with it. `@msw/source` falls back to
    // `new Response('Not Implemented', { status: 501 })`, and the Fetch standard
    // gives a string body a `text/plain` content type by construction — the point
    // this assertion holds is that the answer carries no contract payload at all.
    const undeclared = await requestJson('/api/v1/positions', { response: '418' });
    expect(undeclared.status).toBe(501);
    expect(undeclared.contentType, 'the 501 placeholder is not a documented media type').toMatch(/^text\/plain/);
    expect(undeclared.contentType).not.toContain('application/json');
    expect(undeclared.body).toBe('Not Implemented');
  });
});
