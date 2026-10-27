/**
 * Node adapter: the mock as an interceptor.
 *
 * `msw/node` is imported only here, so the browser entry point can never drag
 * it into a bundle — and this module can never drag `msw/browser` (and its
 * service-worker globals) into a test run.
 */
import { setupServer } from 'msw/node';
import type { SetupServer } from 'msw/node';
import { NetworkReadyState } from 'msw/experimental';
import type { AnyHandler, RequestHandler, SharedOptions } from 'msw';

import type { ContractModel, JsonObject } from './openapi-document.js';
import { CONTRACT_DOCUMENTS, createMockHandlers, loadContractModels } from './handlers.js';
import { loadContractDocuments } from './openapi-loader.js';

export interface MockServerOptions {
  /** Authored contract documents; the ones on disk when omitted. */
  readonly documents?: readonly JsonObject[];
  /**
   * Extra handlers that take precedence over the contract-generated ones — the
   * escape hatch for a test that needs a state the contract cannot express.
   * They are registered with `server.use`, exactly like a per-test override.
   */
  readonly overrides?: readonly AnyHandler[];
  /** Passed to `server.listen`. Pass `false` to start the server un-listened. */
  readonly listen?: Partial<SharedOptions> | false;
}

export interface HarnessMockServer {
  readonly server: SetupServer;
  /** The handlers the contracts generated, kept for assertions and reset flows. */
  readonly handlers: readonly RequestHandler[];
  /** Read models of the contracts the server is serving. */
  readonly models: readonly ContractModel[];
  readonly listen: (options?: Partial<SharedOptions>) => void;
  readonly use: (...overrides: readonly AnyHandler[]) => void;
  readonly reset: () => void;
  /** Idempotent: safe in an `afterAll` for a server built with `listen: false`. */
  readonly close: () => void;
}

/** The authored contracts, as read from `openapi/`. */
export function contractDocuments(): readonly JsonObject[] {
  return loadContractDocuments(CONTRACT_DOCUMENTS);
}

/**
 * Build the mock server for the harness contracts. `onUnhandledRequest`
 * defaults to `error`: a request the contracts do not describe is a defect in
 * the contract, and the harness reports it instead of proxying to nothing.
 */
export async function setupMockServer(options: MockServerOptions = {}): Promise<HarnessMockServer> {
  const documents = options.documents ?? contractDocuments();
  const models = await loadContractModels(documents);
  const handlers = [...(await createMockHandlers({ documents }))];
  const server = setupServer(...handlers);

  /**
   * `msw` 3 treats a second `listen` and a `close` of an already-disabled network
   * as invariant errors rather than no-ops. Both are ordinary here: the constructor
   * listens unless `listen: false` was passed, and an `afterAll` calls `close`
   * whether or not the test ever started interception. The adapter therefore asks
   * the network its own state instead of shadowing it with a second flag that a
   * caller reaching for `server` directly would make a liar.
   */
  const isDisabled = (): boolean => server.readyState === NetworkReadyState.DISABLED;

  const applyOverrides = (): void => {
    for (const override of options.overrides ?? []) {
      server.use(override);
    }
  };

  if (options.listen !== false) {
    server.listen({ onUnhandledFrame: 'error', ...options.listen });
    applyOverrides();
  }

  return {
    server,
    handlers,
    models,
    listen: (listenOptions?: Partial<SharedOptions>) => {
      if (!isDisabled()) {
        return;
      }
      server.listen({ onUnhandledFrame: 'error', ...options.listen, ...listenOptions });
      applyOverrides();
    },
    use: (...overrides: readonly AnyHandler[]) => {
      for (const override of overrides) {
        server.use(override);
      }
    },
    reset: () => {
      server.resetHandlers(...handlers);
      applyOverrides();
    },
    close: () => {
      if (isDisabled()) {
        return;
      }
      server.close();
    },
  };
}
