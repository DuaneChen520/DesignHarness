/**
 * The delivery entry point: contract in, MSW handlers out.
 *
 * The direction is strictly one way. There is not a single `http.get(...)` or
 * hand-typed fixture in this package: every handler is produced by
 * `@msw/source`'s `fromOpenApi` from an authored OpenAPI 3.1 document, and the
 * request semantics those handlers honour are the ones that same document
 * declares (see `contract-behaviour.ts`).
 *
 * `@msw/source` dereferences the document object it is given, so the authored
 * copy is cloned before generation and stays pristine for the harness's own
 * introspection.
 */
import { fromOpenApi } from '@msw/source/open-api';
import type { OpenAPIV3_1 } from 'openapi-types';
import type { RequestHandler } from 'msw';
import { HttpHandler } from 'msw/http';

import type { ContractModel, JsonObject, ResponseMedia } from './openapi-document.js';
import { analyzeContract } from './openapi-document.js';
import type { BehaviourReport, ContractLogger } from './contract-behaviour.js';
import { decorateGeneratedHandler, describeBehaviour, isDecorated } from './contract-behaviour.js';

/**
 * The origin every harness contract declares in its `servers` block. Kept here
 * for test and app ergonomics; `test/contract-drift.test.ts` fails if a
 * document ever disagrees with it.
 */
export const DEFAULT_API_ORIGIN = 'http://localhost:8787';

/** File names of the authored contracts, in the order they are generated. */
export const CONTRACT_DOCUMENTS: readonly string[] = ['data-table.json', 'combobox.json'];

export interface MockHandlerOptions {
  /**
   * Authored contract documents. In Node they are loaded from `openapi/` when
   * omitted; a browser bundle passes the documents it imported from
   * `@designharness/contracts/openapi/*.json`, because this module never touches
   * the filesystem itself.
   */
  readonly documents?: readonly JsonObject[];
  /** Where the harness reports a contract that asks for behaviour it cannot honour. */
  readonly logger?: ContractLogger;
  /**
   * Apply the contract behaviour layer. Always true in delivery; a test that
   * wants the untouched `fromOpenApi` output switches it off to compare the two.
   */
  readonly behaviour?: boolean;
}

/** Raw `fromOpenApi` output for the given documents, with no harness layering. */
export async function generateHandlers(documents: readonly JsonObject[]): Promise<readonly HttpHandler[]> {
  const batches = await Promise.all(documents.map((document) => fromOpenApi(cloneForGeneration(document))));
  return batches.flat();
}

/**
 * `@msw/source` dereferences the document object it is handed, so the authored
 * copy is cloned before generation and stays pristine for the harness's own
 * introspection. The cast is the boundary between "JSON this package parsed"
 * and the document shape `openapi-types` describes; `scripts/codegen.mjs`
 * validates the same document before anything ships from it.
 */
function cloneForGeneration(document: JsonObject): OpenAPIV3_1.Document {
  return structuredClone(document) as unknown as OpenAPIV3_1.Document;
}

/** Build the read model of every contract document. */
export async function loadContractModels(documents?: readonly JsonObject[]): Promise<readonly ContractModel[]> {
  const source = documents ?? (await loadDefaultDocuments());
  return source.map((document) => analyzeContract(document));
}

/**
 * Generate the MSW handlers for the harness contracts. This is the whole mock:
 * hand this list to `msw/node`'s `setupServer` or `msw/browser`'s `setupWorker`.
 */
export async function createMockHandlers(options: MockHandlerOptions = {}): Promise<RequestHandler[]> {
  const documents = options.documents ?? (await loadDefaultDocuments());
  const models = documents.map((document) => analyzeContract(document));
  const generated = await generateHandlers(documents);
  const applyBehaviour = options.behaviour ?? true;
  return generated.map((handler) => (applyBehaviour ? decorateGeneratedHandler(handler, models, options.logger) : handler));
}

/** Handlers exactly as `fromOpenApi` produced them, for the single-source tests. */
export async function createUndecoratedHandlers(options: MockHandlerOptions = {}): Promise<RequestHandler[]> {
  return createMockHandlers({ ...options, behaviour: false });
}

/**
 * What the harness honours per operation. Surfaces a contract that declares a
 * dataset nobody can page through, instead of letting the mock quietly serve
 * every row to every page.
 */
export async function describeContractBehaviour(documents?: readonly JsonObject[]): Promise<readonly BehaviourReport[]> {
  const models = await loadContractModels(documents);
  return models.flatMap((model) => describeBehaviour(model));
}

/** Whether a generated handler belongs to an operation the behaviour layer decorates. */
export function decoratedHandlers(handlers: readonly RequestHandler[], models: readonly ContractModel[]): readonly RequestHandler[] {
  return handlers.filter((handler) => handler instanceof HttpHandler && isDecorated(handler, models));
}

/**
 * The media object of a documented response: the schema node plus the payload
 * the contract declares for it. `assertMatchesSchema` reads the schema from
 * here, which is how the tests prove a mocked body against the document rather
 * than against a copy of it.
 */
export function documentedMedia(model: ContractModel, operationId: string, status: string): ResponseMedia | undefined {
  const operation = model.operations.find((candidate) => candidate.operationId === operationId);
  return operation?.mediaOf(status);
}

/** Build a request URL against the declared origin. */
export function contractUrl(path: string, query?: Readonly<Record<string, string | number>>, origin: string = DEFAULT_API_ORIGIN): string {
  const url = new URL(path, origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, String(value));
  }
  return url.href;
}

/**
 * Node loads the authored contracts off disk. Kept out of this module's static
 * graph so a browser bundle never pulls `node:fs` in: the documents it needs are
 * the ones it imports from the `openapi/` export path.
 */
async function loadDefaultDocuments(): Promise<readonly JsonObject[]> {
  const { loadContractDocuments } = await import('./openapi-loader.js');
  return loadContractDocuments(CONTRACT_DOCUMENTS);
}
