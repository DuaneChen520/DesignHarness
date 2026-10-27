import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { HarnessMockServer } from '../src/node-adapter.js';
import { setupMockServer } from '../src/node-adapter.js';
import type { ContractModel } from '../src/openapi-document.js';
import { positionListResponseSchema } from '../src/schemas.js';
import { asRecord, asRecordList, column, expectOk, requestJson, documentedExample, expectConformsToContract } from './harness.js';

/**
 * The DataTable delivery: the generated mock answers a real `fetch` with a real
 * page, sort and search of the dataset the contract declares, and the answer
 * conforms to the contract itself.
 */
const PATH = '/api/v1/positions';

/**
 * Compare each value with its neighbour without an index lookup. `values[i - 1]`
 * is not defined at index 0 under `noUncheckedIndexedAccess`, and a `!` or a cast
 * to get past that would hide the one boundary the ordering claim is about.
 */
function isOrdered<T>(values: readonly T[], inOrder: (earlier: T, later: T) => boolean): boolean {
  const iterator = values[Symbol.iterator]();
  let previous = iterator.next();
  let later = iterator.next();
  while (!previous.done && !later.done) {
    if (!inOrder(previous.value, later.value)) {
      return false;
    }
    previous = later;
    later = iterator.next();
  }
  return true;
}

let harness: HarnessMockServer;
let dataTable: ContractModel;

beforeAll(async () => {
  harness = await setupMockServer();
  dataTable = harness.models[0] as ContractModel;
});

afterAll(() => {
  harness.close();
});

describe('GET /api/v1/positions', () => {
  it('answers 200 with the envelope the contract documents', async () => {
    const response = await requestJson(PATH);
    expectOk(response);
    expectConformsToContract(response.body, dataTable, 'listPositions', '200');
    expect(positionListResponseSchema.safeParse(response.body).success).toBe(true);

    const envelope = asRecord(response.body, 'positions envelope');
    const rows = asRecordList(envelope['data'], 'data');
    const meta = asRecord(envelope['meta'], 'meta');
    // The declared defaults: page 1 of 10, sorted by symbol ascending.
    expect(rows).toHaveLength(10);
    expect(meta).toEqual({ page: 1, pageSize: 10, total: 24, totalPages: 3, sortBy: 'symbol', sortOrder: 'asc' });
    expect(column(rows, 'symbol')[0]).toBe('AAPL');
  });

  it('pages the declared dataset with correct page math', async () => {
    const response = await requestJson(PATH, { page: 2, pageSize: 5 });
    expectOk(response);
    expectConformsToContract(response.body, dataTable, 'listPositions', '200');

    const envelope = asRecord(response.body, 'positions envelope');
    const rows = asRecordList(envelope['data'], 'data');
    const meta = asRecord(envelope['meta'], 'meta');

    const everyRow = asRecordList(asRecord(documentedExample(dataTable, 'listPositions', '200'), 'declared example')['data'], 'declared rows');
    const sortedSymbols = column(everyRow, 'symbol').slice().sort((left, right) => left.localeCompare(right, 'en'));
    expect(column(rows, 'symbol')).toEqual(sortedSymbols.slice(5, 10));
    expect(meta['total']).toBe(24);
    expect(meta['totalPages']).toBe(5);
    expect(meta['page']).toBe(2);
    expect(meta['pageSize']).toBe(5);

    const lastPage = await requestJson(PATH, { page: 5, pageSize: 5 });
    expectOk(lastPage);
    expect(asRecordList(asRecord(lastPage.body, 'envelope')['data'], 'data')).toHaveLength(4);
  });

  it('applies the sort the request asks for, including negative numbers', async () => {
    const descending = await requestJson(PATH, { sortBy: 'unrealizedPnl', sortOrder: 'desc', pageSize: 100 });
    expectOk(descending);
    expectConformsToContract(descending.body, dataTable, 'listPositions', '200');
    const rows = asRecordList(asRecord(descending.body, 'envelope')['data'], 'data');
    expect(rows).toHaveLength(24);
    const pnl = rows.map((row) => Number(row['unrealizedPnl']));
    expect(isOrdered(pnl, (earlier, later) => earlier >= later)).toBe(true);
    // The three biggest winners, in the order a risk desk reads them.
    expect(column(rows, 'symbol').slice(0, 3)).toEqual(['NVDA', 'META', 'MSFT']);

    const ascendingDates = await requestJson(PATH, { sortBy: 'tradedAt', sortOrder: 'asc', pageSize: 100 });
    expectOk(ascendingDates);
    const tradedAt = column(asRecordList(asRecord(ascendingDates.body, 'envelope')['data'], 'data'), 'tradedAt');
    expect(isOrdered(tradedAt, (earlier, later) => earlier <= later)).toBe(true);

    const meta = asRecord(asRecord(descending.body, 'envelope')['meta'], 'meta');
    expect(meta['sortBy']).toBe('unrealizedPnl');
    expect(meta['sortOrder']).toBe('desc');
  });

  it('filters with the search parameter against the declared text fields', async () => {
    const response = await requestJson(PATH, { q: 'nvidia' });
    expectOk(response);
    const rows = asRecordList(asRecord(response.body, 'envelope')['data'], 'data');
    expect(column(rows, 'symbol')).toEqual(['NVDA']);

    const bySymbol = await requestJson(PATH, { q: 'aapl' });
    expect(column(asRecordList(asRecord(bySymbol.body, 'envelope')['data'], 'data'), 'symbol')).toEqual(['AAPL']);

    const byLongName = await requestJson(PATH, { q: 'corporation' });
    expectOk(byLongName);
    const matches = asRecordList(asRecord(byLongName.body, 'envelope')['data'], 'data');
    expect(matches.length).toBeGreaterThan(1);
    expect(matches.every((row) => JSON.stringify(row).toLowerCase().includes('corporation'))).toBe(true);

    const nothing = await requestJson(PATH, { q: 'no-such-instrument-anywhere' });
    expectOk(nothing);
    expect(asRecordList(asRecord(nothing.body, 'envelope')['data'], 'data')).toEqual([]);
    expect(asRecord(asRecord(nothing.body, 'envelope')['meta'], 'meta')['total']).toBe(0);
  });

  it('filters with the declared accountType parameter and combines with paging', async () => {
    const hedged = await requestJson(PATH, { accountType: 'hedge', pageSize: 100 });
    expectOk(hedged);
    expectConformsToContract(hedged.body, dataTable, 'listPositions', '200');
    const rows = asRecordList(asRecord(hedged.body, 'envelope')['data'], 'data');
    expect(rows).toHaveLength(7);
    expect(new Set(column(rows, 'accountType'))).toEqual(new Set(['hedge']));

    const pagedFilter = await requestJson(PATH, { accountType: 'hedge', page: 2, pageSize: 3 });
    expectOk(pagedFilter);
    const secondPage = asRecordList(asRecord(pagedFilter.body, 'envelope')['data'], 'data');
    const meta = asRecord(asRecord(pagedFilter.body, 'envelope')['meta'], 'meta');
    expect(meta).toEqual({ page: 2, pageSize: 3, total: 7, totalPages: 3, sortBy: 'symbol', sortOrder: 'asc' });
    expect(column(secondPage, 'symbol')).toEqual(['META', 'NFLX', 'NVDA']);
  });
});
