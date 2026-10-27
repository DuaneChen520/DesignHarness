/**
 * The zero-backend mock, in the browser.
 *
 * `startMockWorker` is the contracts package's own browser adapter: it hands the imported
 * OpenAPI 3.1 documents to `@msw/source`'s `fromOpenApi`, layers the contract behaviour on
 * top (paging, sorting, searching, documented error responses) and starts MSW's service
 * worker. Not one handler is written down here, and not one row of data is either: the rows
 * are the `example` dataset the document declares.
 *
 * MSW's worker script is served from the origin root (`public/mockServiceWorker.js`, the file
 * `msw init` writes) and the showcase is served on the port the contract declares as its
 * origin, so the app's own same-origin requests are exactly the ones the generated handlers
 * match — no CORS allowance, no proxied fetch, no second definition of "the API".
 */
import type { JsonObject } from '@designharness/contracts';
import { startMockWorker } from '@designharness/contracts/browser';
import type { SetupWorker } from 'msw/browser';
import comboboxContract from '@designharness/contracts/openapi/combobox.json';
import dataTableContract from '@designharness/contracts/openapi/data-table.json';

/**
 * The documents as `JsonObject`: the JSON import's inferred literal type and the contract
 * package's structural JSON type describe the same bytes, and this is the one place the two
 * are joined.
 */
export const CONTRACT_DOCUMENTS: readonly JsonObject[] = [
  dataTableContract,
  comboboxContract,
] as unknown as readonly JsonObject[];

/**
 * Start the worker and resolve only once it controls this page. Rejects loudly if the worker
 * script is missing — a showcase whose mock never started would otherwise render an empty
 * table and let the contract gate pass on nothing.
 */
export async function startShowcaseMock(): Promise<SetupWorker> {
  return startMockWorker({
    documents: CONTRACT_DOCUMENTS,
    start: { onUnhandledFrame: 'bypass' },
  });
}
