/**
 * The contract behaviour layer.
 *
 * `@msw/source` turns an OpenAPI document into one MSW handler per documented
 * response and resolves a request against the document alone: it seeds a body
 * from the schema, or serves the literal `example` the contract declares. It
 * cannot honour `page`, `sortBy` or `q`, because honouring them means reading
 * the request. That is the only gap this module closes, and it closes it
 * generically:
 *
 * - the rows are the `example` dataset the contract declares, never data
 *   invented in TypeScript;
 * - only parameters the operation *declares* are honoured, and each value is
 *   checked against its declared schema;
 * - a rejected request is answered by re-invoking the generated handler with
 *   `?response=<status>`, so the error payload is the contract's own response
 *   object for that status — the harness never composes an error body;
 * - no URL, method, field name or message is written down in this file.
 *
 * | declared by the contract                              | applied behaviour                          |
 * | :---------------------------------------------------- | :----------------------------------------- |
 * | `page` / `pageSize` plus an object envelope member    | slice, page math, echoed `meta`            |
 * | `sortBy` / `sortOrder`                                | stable sort using the column's declared type |
 * | `q`                                                   | case-insensitive substring over every string column |
 * | any other parameter named after a row property        | exact-match filter                         |
 * | a path parameter named after a record identity field  | record lookup, documented `404` on a miss  |
 * | a `requestBody` schema                                | body validation, documented `400` on a violation |
 */
import { HttpHandler } from 'msw/http';
import type { ResponseResolver } from 'msw';

import type { ContractModel, JsonValue, OperationView } from './openapi-document.js';
import { asJsonObject, itemSchemaOf, propertySchemaMap, recordStores, schemaTypeNames } from './openapi-document.js';
import type { JsonObject } from './openapi-document.js';
import { validateSchema } from './testing/openapi-assert.js';

/** Query parameters with a meaning of their own; anything else filters by name. */
export const RESERVED_PARAMETERS: readonly string[] = ['page', 'pageSize', 'sortBy', 'sortOrder', 'q'];

/** Status preference when the contract documents more than one rejection. */
const SCHEMA_REJECTION_STATUSES: readonly string[] = ['400', '422'];
const RANGE_REJECTION_STATUSES: readonly string[] = ['422', '400'];
const MISSING_RECORD_STATUSES: readonly string[] = ['404', '400'];

export interface ContractLogger {
  warn(message: string): void;
}

const silentLogger: ContractLogger = {
  warn: () => {
    /* a harness that says nothing is a harness that hides nothing */
  },
};

interface RowField {
  readonly name: string;
  readonly type: string;
}

interface CollectionShape {
  readonly itemsKey: string;
  readonly metaKey: string | undefined;
  readonly rowFields: readonly RowField[];
  readonly rows: readonly JsonObject[];
}

interface OperationBehaviour {
  readonly operation: OperationView;
  readonly collection: CollectionShape | undefined;
  readonly recordField: string | undefined;
  readonly records: ReadonlyMap<string, JsonObject> | undefined;
}

export interface BehaviourReport {
  readonly operationId: string;
  readonly method: string;
  readonly url: string;
  readonly collection: boolean;
  readonly recordLookup: string | undefined;
  readonly requestBody: boolean;
  readonly honours: readonly string[];
}

/**
 * Whether the harness has anything to do for an operation: it pages a declared
 * dataset, resolves a declared record, or validates a declared request body.
 * An operation that does none of those keeps the generated handler untouched.
 */
function honoursRequestSemantics(behaviour: OperationBehaviour): boolean {
  return behaviour.collection !== undefined || behaviour.records !== undefined || behaviour.operation.requestBodySchema !== undefined;
}

/**
 * The behaviour the contract entitles an operation to, derived once so the
 * resolver does no schema archaeology per request.
 */
export function behaviourFor(operation: OperationView): OperationBehaviour {
  return {
    operation,
    collection: collectionShapeOf(operation),
    recordField: recordFieldOf(operation),
    records: recordsOf(operation),
  };
}

/** A human-readable account of what the mock will honour, for tests and codegen logs. */
export function describeBehaviour(model: ContractModel): readonly BehaviourReport[] {
  return model.operations.map((operation) => {
    const behaviour = behaviourFor(operation);
    const filters = [...operation.queryParameters.keys()].filter((name) => !RESERVED_PARAMETERS.includes(name) && behaviour.collection?.rowFields.some((field) => field.name === name));
    const honours = [...operation.queryParameters.keys()].filter((name) => RESERVED_PARAMETERS.includes(name) || filters.includes(name));
    return {
      operationId: operation.operationId,
      method: operation.method.toUpperCase(),
      url: operation.url,
      collection: behaviour.collection !== undefined,
      recordLookup: behaviour.recordField,
      requestBody: operation.requestBodySchema !== undefined,
      honours,
    };
  });
}

/**
 * Rebuild a generated handler so it applies the request semantics its contract
 * declares. A handler the contract describes but that declares no request
 * semantics (e.g. a plain `202` accept) is returned untouched, still 100% the
 * generated one.
 */
export function decorateGeneratedHandler(generated: HttpHandler, models: readonly ContractModel[], logger: ContractLogger = silentLogger): HttpHandler {
  const operation = findOperation(generated, models);
  const path = generated.info.path;
  if (!operation || typeof path !== 'string') {
    return generated;
  }
  const behaviour = behaviourFor(operation);
  if (!honoursRequestSemantics(behaviour)) {
    return generated;
  }
  return new HttpHandler(generated.info.method, path, createContractResolver(generated, behaviour, logger));
}

/** Whether the harness decorates this generated handler at all. */
export function isDecorated(generated: HttpHandler, models: readonly ContractModel[]): boolean {
  const operation = findOperation(generated, models);
  return operation !== undefined && honoursRequestSemantics(behaviourFor(operation));
}

function findOperation(generated: HttpHandler, models: readonly ContractModel[]): OperationView | undefined {
  const path = generated.info.path;
  if (typeof path !== 'string') {
    return undefined;
  }
  const method = String(generated.info.method).toUpperCase();
  for (const model of models) {
    const operation = model.operations.find((candidate) => candidate.url === path && candidate.method.toUpperCase() === method);
    if (operation) {
      return operation;
    }
  }
  return undefined;
}

function collectionShapeOf(operation: OperationView): CollectionShape | undefined {
  const example = operation.successExample;
  const schema = operation.success?.schema;
  if (!example || !schema) {
    return undefined;
  }
  const document = operation.document;
  const properties = propertySchemaMap(document, schema);
  for (const [name, propertySchema] of properties) {
    if (!schemaTypeNames(propertySchema).includes('array')) {
      continue;
    }
    const declared = example[name];
    if (!Array.isArray(declared)) {
      continue;
    }
    const rows = declared.filter((row): row is JsonObject => typeof row === 'object' && row !== null && !Array.isArray(row));
    if (rows.length === 0) {
      continue;
    }
    const rowFields = [...propertySchemaMap(document, itemSchemaOf(document, propertySchema))].map(([fieldName, fieldSchema]) => ({
      name: fieldName,
      type: schemaTypeNames(fieldSchema)[0] ?? 'unknown',
    }));
    let metaKey: string | undefined;
    for (const [candidate, candidateSchema] of properties) {
      if (candidate !== name && schemaTypeNames(candidateSchema).includes('object') && typeof example[candidate] === 'object') {
        metaKey = candidate;
        break;
      }
    }
    return { itemsKey: name, metaKey, rowFields, rows };
  }
  return undefined;
}

function recordFieldOf(operation: OperationView): string | undefined {
  if (operation.pathParameters.length === 0 || operation.successExample === undefined) {
    return undefined;
  }
  const stores = recordStores(operation.document);
  return operation.pathParameters.find((name) => (stores.get(name)?.size ?? 0) > 0);
}

function recordsOf(operation: OperationView): ReadonlyMap<string, JsonObject> | undefined {
  const field = recordFieldOf(operation);
  return field ? recordStores(operation.document).get(field) : undefined;
}

function createContractResolver(generated: HttpHandler, behaviour: OperationBehaviour, logger: ContractLogger): ResponseResolver {
  const { operation } = behaviour;

  const runGenerated = async (request: Request): Promise<Response | undefined> => {
    const result = await generated.run({ request, requestId: operation.operationId });
    return result?.response;
  };

  const runDocumentedStatus = async (request: Request, status: string): Promise<Response | undefined> =>
    runGenerated(await requestWithResponseStatus(request, status));

  const pickStatus = (preference: readonly string[]): string | undefined => preference.find((status) => operation.documentedStatuses.has(status));

  return async ({ request }) => {
    const url = new URL(request.url);

    // A caller that names a documented response (`?response=` / `?example=` are
    // read by @msw/source itself) is served that response verbatim, with no
    // interpretation layered on top of it.
    if (url.searchParams.has('response') || url.searchParams.has('example')) {
      return runGenerated(request);
    }

    const parameters = readDeclaredParameters(request, operation);
    const bodyRejections: string[] = [];
    await readRequestBody(request, operation, bodyRejections);
    const rejections = [...parameters.rejections, ...bodyRejections];

    if (rejections.length > 0) {
      const status = pickStatus(SCHEMA_REJECTION_STATUSES);
      if (status) {
        logger.warn(`contracts: ${operation.operationId} rejected by its own schema: ${rejections.join('; ')}`);
        return runDocumentedStatus(request, status);
      }
    }

    if (behaviour.recordField && behaviour.records) {
      const identity = pathParameterValues(operation, request.url).get(behaviour.recordField);
      if (identity !== undefined) {
        const record = behaviour.records.get(identity);
        if (!record) {
          const status = pickStatus(MISSING_RECORD_STATUSES);
          if (status) {
            logger.warn(`contracts: ${operation.operationId} has no ${behaviour.recordField} "${identity}" in the declared examples`);
            return runDocumentedStatus(request, status);
          }
          return runGenerated(request);
        }
        const response = await runGenerated(request);
        return response ? asJsonResponse(response, record) : undefined;
      }
    }

    if (!behaviour.collection) {
      return runGenerated(request);
    }

    const { itemsKey, metaKey, rowFields, rows } = behaviour.collection;
    let selected = [...rows];

    for (const [name, schema] of operation.queryParameters) {
      if (RESERVED_PARAMETERS.includes(name) || !rowFields.some((field) => field.name === name)) {
        continue;
      }
      const value = parameters.values.get(name);
      if (value === undefined || !schemaTypeNames(schema).includes('string')) {
        continue;
      }
      selected = selected.filter((row) => String(row[name] ?? '') === value);
    }

    const search = parameters.values.get('q');
    if (search !== undefined && search !== '') {
      const needle = search.toLowerCase();
      const textFields = rowFields.filter((field) => field.type === 'string').map((field) => field.name);
      selected = selected.filter((row) => textFields.some((field) => String(row[field] ?? '').toLowerCase().includes(needle)));
    }

    const sortBy = parameters.values.get('sortBy');
    const sortOrder = parameters.values.get('sortOrder') ?? 'asc';
    if (sortBy !== undefined && sortBy !== '') {
      if (!rowFields.some((field) => field.name === sortBy)) {
        const status = pickStatus(RANGE_REJECTION_STATUSES);
        if (status) {
          logger.warn(`contracts: ${operation.operationId} cannot sort by "${sortBy}"; no such row property is declared`);
          return runDocumentedStatus(request, status);
        }
      } else {
        const direction = sortOrder === 'desc' ? -1 : 1;
        selected = selected
          .map((row, index) => ({ row, index }))
          .sort((left, right) => direction * compareValues(left.row[sortBy], right.row[sortBy]) || left.index - right.index)
          .map((entry) => entry.row);
      }
    }

    const response = await runGenerated(request);
    if (!response) {
      return undefined;
    }
    const envelope = asJsonObject(await response.clone().json());
    if (!envelope) {
      return response;
    }

    const total = selected.length;
    const requestedPageSize = parameters.values.get('pageSize');
    const requestedPage = parameters.values.get('page');
    const pageSize = requestedPageSize === undefined ? total || 1 : Number(requestedPageSize);
    const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
    const page = requestedPage === undefined ? 1 : Number(requestedPage);

    if (totalPages > 0 && page > totalPages) {
      const status = pickStatus(RANGE_REJECTION_STATUSES);
      if (status) {
        logger.warn(`contracts: ${operation.operationId} was asked for page ${String(page)} of ${String(totalPages)}`);
        return runDocumentedStatus(request, status);
      }
    }

    const offset = (page - 1) * pageSize;
    const body: JsonObject = { ...envelope };
    body[itemsKey] = selected.slice(offset, offset + pageSize);
    if (metaKey) {
      const meta: JsonObject = { ...asJsonObject(body[metaKey]) };
      if ('page' in meta) {
        meta['page'] = page;
      }
      if ('pageSize' in meta) {
        meta['pageSize'] = pageSize;
      }
      if ('total' in meta) {
        meta['total'] = total;
      }
      if ('totalPages' in meta) {
        meta['totalPages'] = totalPages;
      }
      if ('sortBy' in meta) {
        meta['sortBy'] = sortBy ?? operation.queryParameters.get('sortBy')?.['default'] ?? '';
      }
      if ('sortOrder' in meta) {
        meta['sortOrder'] = sortOrder;
      }
      body[metaKey] = meta;
    }

    return asJsonResponse(response, body);
  };
}

interface DeclaredParameters {
  readonly values: ReadonlyMap<string, string>;
  readonly rejections: readonly string[];
}

/**
 * Read only the parameters the operation declares, applying the declared
 * `default` when the client omits one, and reject values that violate their
 * declared schema.
 */
function readDeclaredParameters(request: Request, operation: OperationView): DeclaredParameters {
  const url = new URL(request.url);
  const values = new Map<string, string>();
  const rejections: string[] = [];

  for (const [name, schema] of operation.queryParameters) {
    const raw = url.searchParams.get(name);
    if (raw === null || raw === '') {
      const fallback = schema['default'];
      if (typeof fallback === 'string' || typeof fallback === 'number') {
        values.set(name, String(fallback));
      }
      continue;
    }
    const candidate = coerce(raw, schema);
    const result = validateSchema(candidate, schema, { document: operation.document });
    if (!result.valid) {
      rejections.push(...result.issues.map((issue) => `${name}${issue.path.slice(1)}: ${issue.message}`));
      continue;
    }
    values.set(name, raw);
  }

  return { values, rejections };
}

/**
 * Validate a JSON request body against the schema the operation declares. A
 * body the contract marks required but the caller omits is a rejection too, so
 * the DataTable cannot queue an export the origin would refuse.
 */
async function readRequestBody(request: Request, operation: OperationView, rejections: string[]): Promise<void> {
  const schema = operation.requestBodySchema;
  if (!schema) {
    return;
  }
  let raw: string;
  try {
    raw = await request.clone().text();
  } catch {
    // An unusable body stream is the caller's problem, not the contract's.
    return;
  }
  if (raw.trim().length === 0) {
    if (operation.requestBodyRequired) {
      rejections.push('requestBody: the contract requires a request body');
    }
    return;
  }
  let payload: JsonValue;
  try {
    payload = JSON.parse(raw) as JsonValue;
  } catch {
    rejections.push('requestBody: the payload is not valid JSON');
    return;
  }
  const result = validateSchema(payload, schema, { document: operation.document });
  if (!result.valid) {
    rejections.push(...result.issues.map((issue) => `requestBody${issue.path.slice(1)}: ${issue.message}`));
  }
}

function coerce(raw: string, schema: JsonObject): JsonValue {
  const types = schemaTypeNames(schema);
  if (types.includes('integer') || types.includes('number')) {
    const value = Number(raw);
    return Number.isNaN(value) ? raw : value;
  }
  if (types.includes('boolean')) {
    if (raw === 'true') {
      return true;
    }
    if (raw === 'false') {
      return false;
    }
    return raw;
  }
  return raw;
}

/** Split a request URL over the operation's path template. */
function pathParameterValues(operation: OperationView, requestUrl: string): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  const template = operation.url.split('/');
  const url = new URL(requestUrl);
  const concrete = `${url.origin}${url.pathname}`.split('/');
  if (template.length !== concrete.length) {
    return found;
  }
  for (const [index, segment] of template.entries()) {
    const value = concrete[index];
    if (value === undefined) {
      continue;
    }
    if (segment.startsWith(':')) {
      found.set(segment.slice(1), decodeURIComponent(value));
    }
  }
  return found;
}

function compareValues(left: JsonValue | undefined, right: JsonValue | undefined): number {
  if (typeof left === 'number' && typeof right === 'number') {
    return left === right ? 0 : left < right ? -1 : 1;
  }
  const leftText = left === null || left === undefined ? '' : String(left);
  const rightText = right === null || right === undefined ? '' : String(right);
  return leftText.localeCompare(rightText, 'en');
}

function asJsonResponse(response: Response, body: unknown): Response {
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), { status: response.status, statusText: response.statusText, headers });
}

/**
 * Ask the generated handler for the response the contract documents under
 * `status`. This is `@msw/source`'s own selection mechanism, so the body and
 * headers of every rejection come from the document.
 */
async function requestWithResponseStatus(request: Request, status: string): Promise<Request> {
  const url = new URL(request.url);
  url.searchParams.set('response', status);
  const isBodyless = request.method === 'GET' || request.method === 'HEAD';
  const buffer = isBodyless ? undefined : await request.clone().arrayBuffer();
  return new Request(url, {
    method: request.method,
    headers: new Headers(request.headers),
    body: buffer && buffer.byteLength > 0 ? buffer : null,
  });
}
