/**
 * Browser adapter: the mock as a service worker.
 *
 * The mirror image of `node-adapter.ts`: this is the only module in the package
 * that imports `msw/browser`, and it is the reason `msw/node` and `node:fs` are
 * kept out of the package root. A bundler targeting the browser therefore never
 * sees an interceptor it cannot run, and a Node test never sees a
 * `navigator.serviceWorker` it cannot provide.
 *
 * The app is responsible for serving `mockServiceWorker.js` at the origin root
 * (`npx msw init <publicDir>`), which is standard MSW browser setup.
 */
import { setupWorker } from 'msw/browser';
import type { SetupWorker, StartOptions } from 'msw/browser';

import type { JsonObject } from './openapi-document.js';
import { createMockHandlers } from './handlers.js';
import type { ContractLogger } from './contract-behaviour.js';

export interface MockWorkerOptions {
  /**
   * The contract documents, imported by the app:
   *
   * ```ts
   * import positions from '@designharness/contracts/openapi/data-table.json';
   * import instruments from '@designharness/contracts/openapi/combobox.json';
   * ```
   *
   * Required here because a browser bundle has no filesystem to read from.
   */
  readonly documents: readonly JsonObject[];
  readonly logger?: ContractLogger;
  /** Forwarded to `worker.start`. Defaults to bypassing unhandled requests. */
  readonly start?: StartOptions;
  /**
   * Origin the mock should bind to. When omitted, defaults to `window.location.origin`
   * in browser contexts so the mock matches the actual serving port.
   */
  readonly origin?: string;
}

/** Generate the handlers and wrap them in an MSW worker, without starting it. */
export async function createMockWorker(
  documents: readonly JsonObject[],
  logger?: ContractLogger,
  origin?: string,
): Promise<SetupWorker> {
  const runtimeOrigin =
    origin ?? (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : undefined);
  const handlers = await createMockHandlers({ documents, logger, origin: runtimeOrigin });
  return setupWorker(...handlers);
}

/** Generate, wrap and start the worker in one call. */
export async function startMockWorker(options: MockWorkerOptions): Promise<SetupWorker> {
  const worker = await createMockWorker(options.documents, options.logger, options.origin);
  await worker.start({ onUnhandledFrame: 'bypass', ...options.start });
  return worker;
}
