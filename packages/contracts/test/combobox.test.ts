import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { HarnessMockServer } from '../src/node-adapter.js';
import { setupMockServer } from '../src/node-adapter.js';
import type { ContractModel } from '../src/openapi-document.js';
import { instrumentSearchResponseSchema } from '../src/schemas.js';
import { asRecord, asRecordList, column, expectOk, requestJson, expectConformsToContract } from './harness.js';

/**
 * The async-search Combobox delivery. The whole option list lives in the
 * contract's declared example; the mock only filters it.
 */
const SEARCH = '/api/v1/instruments/search';

let harness: HarnessMockServer;
let combobox: ContractModel;
let knownId: string;

beforeAll(async () => {
  harness = await setupMockServer();
  combobox = harness.models[1] as ContractModel;
  const all = await requestJson(SEARCH);
  const [firstInstrument] = asRecordList(asRecord(all.body, 'envelope')['items'], 'items');
  if (!firstInstrument) {
    throw new Error('the declared reference book is empty; there is nothing for a committed selection to re-read');
  }
  knownId = String(firstInstrument['id']);
});

afterAll(() => {
  harness.close();
});

describe('GET /api/v1/instruments/search', () => {
  it('serves the declared reference book when no query is typed', async () => {
    const response = await requestJson(SEARCH);
    expectOk(response);
    expectConformsToContract(response.body, combobox, 'searchInstruments', '200');
    expect(instrumentSearchResponseSchema.safeParse(response.body).success).toBe(true);
    expect(asRecordList(asRecord(response.body, 'envelope')['items'], 'items')).toHaveLength(18);
  });

  it('narrows the list as the query changes', async () => {
    const futures = await requestJson(SEARCH, { q: 'futures' });
    expectOk(futures);
    expectConformsToContract(futures.body, combobox, 'searchInstruments', '200');
    const items = asRecordList(asRecord(futures.body, 'envelope')['items'], 'items');
    expect(column(items, 'value')).toEqual(['ES', 'NQ', 'CL', 'TY', 'FV', 'GC', 'SI']);
    expect(items.every((item) => JSON.stringify(item).toLowerCase().includes('futures'))).toBe(true);

    const dollars = await requestJson(SEARCH, { q: 'usd' });
    expectOk(dollars);
    const values = column(asRecordList(asRecord(dollars.body, 'envelope')['items'], 'items'), 'value');
    expect(values).toEqual(['EURUSD', 'USDJPY', 'GBPUSD', 'BTCUSD', 'ETHUSD']);

    // A different query must produce a different list, or the parameter is
    // being ignored and the Combobox would look like it never searches.
    expect(values).not.toEqual(column(items, 'value'));

    const none = await requestJson(SEARCH, { q: 'nothing-matches-this' });
    expectOk(none);
    expect(asRecordList(asRecord(none.body, 'envelope')['items'], 'items')).toEqual([]);
  });

  it('keeps ungrouped instruments nullable, as the contract declares', async () => {
    const response = await requestJson(SEARCH, { q: 'bitcoin' });
    expectOk(response);
    const items = asRecordList(asRecord(response.body, 'envelope')['items'], 'items');
    expect(items).toHaveLength(1);
    const bitcoin = items[0];
    expect(bitcoin, 'the search matched a row the envelope did not carry').toBeDefined();
    expect(bitcoin?.['group']).toBeNull();
  });

  it('re-reads a committed selection by id and 404s an unknown one', async () => {
    const known = await requestJson(`/api/v1/instruments/${knownId}`);
    expectOk(known);
    expectConformsToContract(known.body, combobox, 'getInstrument', '200');
    expect(asRecord(known.body, 'instrument')['id']).toBe(knownId);

    const unknown = await requestJson('/api/v1/instruments/00000000-0000-4000-8000-000000000000');
    expect(unknown.status).toBe(404);
    expectConformsToContract(unknown.body, combobox, 'getInstrument', '404');
  });
});
