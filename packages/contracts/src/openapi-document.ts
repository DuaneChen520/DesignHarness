/**
 * Read-side model of an OpenAPI 3.1 contract.
 *
 * `@msw/source` dereferences a *copy* of the document when it generates
 * handlers, so the harness keeps the authored document untouched and reads it
 * through this module instead. Everything the behaviour layer and the drift
 * gates need — declared parameters, the success envelope, the example dataset,
 * `components.schemas` property sets and the identity fields of the records the
 * contract declares — is looked up here, which keeps the claim "the contract is
 * the only source" auditable in one file.
 */
export type { JsonSchema } from './testing/openapi-assert.js';

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export const HTTP_METHODS: readonly string[] = ['get', 'put', 'post', 'patch', 'delete', 'options', 'head', 'trace'];

export interface ResponseMedia {
  readonly mediaType: string;
  readonly schema: JsonObject | undefined;
  /** The literal payload the contract declares for this response, if any. */
  readonly example: JsonValue | undefined;
  readonly exampleName: string | undefined;
}

export interface OperationView {
  readonly operationId: string;
  readonly method: string;
  /** Path template exactly as authored, e.g. `/api/v1/instruments/{id}`. */
  readonly path: string;
  /** Path with OpenAPI parameters rewritten to the `:name` form MSW matches. */
  readonly mswPath: string;
  /** Request URL the generated handler matches: declared server plus `mswPath`. */
  readonly url: string;
  /** The authored document this operation belongs to, for `$ref` resolution. */
  readonly document: JsonObject;
  readonly pathParameters: readonly string[];
  /** Query parameter name -> its declared schema. */
  readonly queryParameters: ReadonlyMap<string, JsonObject>;
  readonly requestBodySchema: JsonObject | undefined;
  readonly requestBodyRequired: boolean;
  /** Status codes the operation documents, as strings, including `default`. */
  readonly documentedStatuses: ReadonlySet<string>;
  readonly successStatus: string | undefined;
  readonly success: ResponseMedia | undefined;
  /** The payload the contract declares for the success response, if any. */
  readonly successExample: JsonObject | undefined;
  /** Read the media of any documented status, resolving `$ref` responses. */
  mediaOf(status: string): ResponseMedia | undefined;
}

export interface ContractModel {
  readonly document: JsonObject;
  readonly title: string;
  readonly version: string;
  readonly openapi: string;
  readonly serverUrls: readonly string[];
  readonly operations: readonly OperationView[];
  readonly schemas: ReadonlyMap<string, JsonObject>;
  /** `identity field -> identity value -> record` for this document's examples. */
  readonly records: ReadonlyMap<string, ReadonlyMap<string, JsonObject>>;
  operationFor(method: string, url: string): OperationView | undefined;
}

export const isJsonObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value);

export const asJsonObject = (value: unknown): JsonObject | undefined => (isJsonObject(value) ? value : undefined);

export const asJsonArray = (value: unknown): readonly JsonValue[] => (Array.isArray(value) ? (value as readonly JsonValue[]) : []);

/** Resolve a document-local JSON pointer (`#/components/schemas/Position`). */
export function resolvePointer(document: JsonObject, ref: string): JsonValue | undefined {
  if (!ref.startsWith('#/')) {
    return undefined;
  }
  let current: JsonValue | undefined = document;
  for (const rawToken of ref.slice(2).split('/')) {
    const token = rawToken.replace(/~1/g, '/').replace(/~0/g, '~');
    const holder = asJsonObject(current);
    if (!holder) {
      return undefined;
    }
    const next: JsonValue | undefined = holder[token];
    if (next === undefined) {
      return undefined;
    }
    current = next;
  }
  return current;
}

/** Rewrite `/positions/{jobId}` into the `/positions/:jobId` form MSW matches. */
export function toMswPath(path: string): string {
  return path.replace(/\{(.+?)\}/g, ':$1');
}

/** Follow a `$ref` when the node is a reference, otherwise return the node. */
export function resolveSchemaNode(document: JsonObject, node: JsonValue | undefined): JsonObject | undefined {
  const object = asJsonObject(node);
  if (!object) {
    return undefined;
  }
  const ref = object['$ref'];
  if (typeof ref === 'string') {
    return asJsonObject(resolvePointer(document, ref));
  }
  return object;
}

/** The declared type names of a schema node (`["string","null"]` -> both). */
export function schemaTypeNames(schema: JsonObject | undefined): readonly string[] {
  if (!schema) {
    return [];
  }
  const declared = schema['type'];
  if (Array.isArray(declared)) {
    return declared.filter((entry): entry is string => typeof entry === 'string');
  }
  return typeof declared === 'string' ? [declared] : [];
}

/** Property map of an object node, each entry resolved through `$ref` chains. */
export function propertySchemaMap(document: JsonObject, schema: JsonObject | undefined): ReadonlyMap<string, JsonObject> {
  const properties = resolveSchemaNode(document, schema?.['properties']);
  const result = new Map<string, JsonObject>();
  if (!properties) {
    return result;
  }
  for (const [name, value] of Object.entries(properties)) {
    const child = resolveSchemaNode(document, value);
    if (child) {
      result.set(name, child);
    }
  }
  return result;
}

/** Item schema of an array node, resolved through `$ref`. */
export function itemSchemaOf(document: JsonObject, schema: JsonObject | undefined): JsonObject | undefined {
  return schemaTypeNames(schema).includes('array') ? resolveSchemaNode(document, schema?.['items']) : undefined;
}

/** `components.schemas` property names, the set a zod guard has to mirror. */
export function schemaPropertyNames(schema: JsonObject): readonly string[] {
  return Object.keys(asJsonObject(schema['properties']) ?? {});
}

/** `components.schemas` required names. */
export function schemaRequiredNames(schema: JsonObject): readonly string[] {
  return asJsonArray(schema['required']).filter((entry): entry is string => typeof entry === 'string');
}

/** The `enum` values of a schema node, when it declares one. */
export function schemaEnumValues(schema: JsonObject | undefined): readonly (null | boolean | number | string)[] {
  if (!schema) {
    return [];
  }
  return asJsonArray(schema['enum']).filter((entry): entry is null | boolean | number | string => entry === null || typeof entry !== 'object');
}

/** Every `$ref` string in the document, with the pointer location it appeared at. */
export function collectRefs(document: JsonObject): ReadonlyArray<{ readonly location: string; readonly ref: string }> {
  const found: Array<{ location: string; ref: string }> = [];
  const walk = (node: JsonValue, pointer: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => {
        if (item !== null && typeof item === 'object') {
          walk(item, `${pointer}/${String(index)}`);
        }
      });
      return;
    }
    const object = asJsonObject(node);
    if (!object) {
      return;
    }
    for (const [key, value] of Object.entries(object)) {
      const childPointer = `${pointer}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
      if (key === '$ref' && typeof value === 'string') {
        found.push({ location: childPointer.slice(1), ref: value });
      } else if (value !== null && typeof value === 'object') {
        walk(value, childPointer);
      }
    }
  };
  walk(document, '#');
  return found;
}

const storesCache = new WeakMap<JsonObject, ReadonlyMap<string, ReadonlyMap<string, JsonObject>>>();

/**
 * Every record the document declares, indexed by its identity field (`id`,
 * `jobId`, ...). Record stores are what let a single-resource GET answer with
 * the contract's own data and return the documented `404` for a miss.
 */
export function recordStores(document: JsonObject): ReadonlyMap<string, ReadonlyMap<string, JsonObject>> {
  const cached = storesCache.get(document);
  if (cached) {
    return cached;
  }
  const store = new Map<string, Map<string, JsonObject>>();
  const register = (candidate: unknown): void => {
    const record = asJsonObject(candidate);
    if (!record) {
      return;
    }
    for (const [key, value] of Object.entries(record)) {
      if (typeof value !== 'string' || !/^(?:id|[a-z][A-Za-z0-9]*Id)$/.test(key)) {
        continue;
      }
      let bucket = store.get(key);
      if (!bucket) {
        bucket = new Map<string, JsonObject>();
        store.set(key, bucket);
      }
      if (!bucket.has(value)) {
        bucket.set(value, record);
      }
    }
  };
  const walk = (node: JsonValue | undefined): void => {
    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item);
      }
      return;
    }
    const object = asJsonObject(node);
    if (!object) {
      return;
    }
    // A schema node must never be mistaken for data: only example payloads and
    // the arrays inside them describe records.
    if (object['type'] !== undefined || object['properties'] !== undefined || object['$ref'] !== undefined) {
      return;
    }
    register(object);
    for (const child of Object.values(object)) {
      walk(child);
    }
  };
  for (const example of Object.values(asJsonObject(asJsonObject(document['components'])?.['examples']) ?? {})) {
    walk(resolveSchemaNode(document, example)?.['value']);
  }
  const paths = asJsonObject(document['paths']);
  for (const pathItem of Object.values(paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = asJsonObject(asJsonObject(pathItem)?.[method]);
      if (!operation) {
        continue;
      }
      for (const value of Object.values(asJsonObject(operation['example']) ?? {})) {
        walk(value);
      }
    }
  }
  storesCache.set(document, store);
  return store;
}

function mediaOf(document: JsonObject, responseValue: JsonValue | undefined): ResponseMedia | undefined {
  const response = resolveSchemaNode(document, responseValue);
  if (!response) {
    return undefined;
  }
  const content = asJsonObject(response['content']);
  if (!content) {
    return { mediaType: 'application/json', schema: undefined, example: undefined, exampleName: undefined };
  }
  const mediaNames = Object.keys(content);
  const mediaType = mediaNames.includes('application/json') ? 'application/json' : mediaNames[0];
  const media = mediaType ? asJsonObject(content[mediaType]) : undefined;
  if (!media || !mediaType) {
    return undefined;
  }
  const inline = media['example'];
  if (inline !== undefined) {
    return { mediaType, schema: resolveSchemaNode(document, media['schema']), example: inline, exampleName: undefined };
  }
  const named = asJsonObject(media['examples']);
  const firstName = named ? Object.keys(named)[0] : undefined;
  const exampleObject = firstName ? resolveSchemaNode(document, named?.[firstName]) : undefined;
  return {
    mediaType,
    schema: resolveSchemaNode(document, media['schema']),
    example: exampleObject?.['value'],
    exampleName: firstName,
  };
}

function successStatusOf(statuses: Iterable<string>): string | undefined {
  const ordered = [...statuses].sort((left, right) => {
    if (left === 'default') {
      return 1;
    }
    if (right === 'default') {
      return -1;
    }
    return Number(left) - Number(right);
  });
  return ordered.find((status) => status.startsWith('2'));
}

function buildOperation(document: JsonObject, method: string, path: string, operation: JsonObject, serverUrl: string): OperationView {
  const mswPath = toMswPath(path);
  const queryParameters = new Map<string, JsonObject>();
  const pathParameters: string[] = [];
  for (const entry of asJsonArray(operation['parameters'])) {
    const parameter = resolveSchemaNode(document, entry);
    if (!parameter) {
      continue;
    }
    const name = parameter['name'];
    const place = parameter['in'];
    if (typeof name !== 'string' || typeof place !== 'string') {
      continue;
    }
    if (place === 'query') {
      const schema = resolveSchemaNode(document, parameter['schema']);
      if (schema) {
        queryParameters.set(name, schema);
      }
    } else if (place === 'path') {
      pathParameters.push(name);
    }
  }

  const responses = new Map<string, JsonObject>();
  for (const [status, value] of Object.entries(asJsonObject(operation['responses']) ?? {})) {
    const response = resolveSchemaNode(document, value);
    if (response) {
      responses.set(status, response);
    }
  }

  const successStatus = successStatusOf(responses.keys());
  const success = successStatus ? mediaOf(document, responses.get(successStatus)) : undefined;
  const requestBody = resolveSchemaNode(document, operation['requestBody']);
  const requestMedia = requestBody ? mediaOf(document, { content: asJsonObject(requestBody['content']) ?? {} }) : undefined;

  const mediaFor = (status: string): ResponseMedia | undefined => {
    const direct = responses.get(status);
    if (direct) {
      return mediaOf(document, direct);
    }
    const fallback = responses.get('default');
    return fallback ? mediaOf(document, fallback) : undefined;
  };

  return {
    operationId: typeof operation['operationId'] === 'string' ? operation['operationId'] : `${method} ${path}`,
    method,
    path,
    mswPath,
    url: `${serverUrl}${mswPath}`,
    document,
    pathParameters,
    queryParameters,
    requestBodySchema: requestMedia?.schema,
    requestBodyRequired: requestBody ? requestBody['required'] === true : false,
    documentedStatuses: new Set(responses.keys()),
    successStatus,
    success,
    successExample: asJsonObject(success?.example),
    mediaOf: mediaFor,
  };
}

/** Build the read model for one authored contract document. */
export function analyzeContract(document: JsonObject): ContractModel {
  const info = asJsonObject(document['info']) ?? {};
  const servers = asJsonArray(document['servers']).flatMap((entry) => {
    const url = asJsonObject(entry)?.['url'];
    return typeof url === 'string' ? [url.replace(/\/+$/, '')] : [];
  });
  const serverUrls: readonly string[] = servers.length > 0 ? servers : [''];
  const serverUrl = serverUrls[0] ?? '';

  const operations = Object.entries(asJsonObject(document['paths']) ?? {}).flatMap(([path, item]) => {
    const pathItem = asJsonObject(item);
    if (!pathItem) {
      return [];
    }
    return HTTP_METHODS.flatMap((method) => {
      const operation = asJsonObject(pathItem[method]);
      return operation ? [buildOperation(document, method, path, operation, serverUrl)] : [];
    });
  });

  const schemas = new Map<string, JsonObject>();
  for (const [name, schema] of Object.entries(asJsonObject(asJsonObject(document['components'])?.['schemas']) ?? {})) {
    const resolved = asJsonObject(schema);
    if (resolved) {
      schemas.set(name, resolved);
    }
  }

  return {
    document,
    title: typeof info['title'] === 'string' ? info['title'] : 'unnamed contract',
    version: typeof info['version'] === 'string' ? info['version'] : '0.0.0',
    openapi: typeof document['openapi'] === 'string' ? document['openapi'] : '',
    serverUrls,
    operations,
    schemas,
    records: recordStores(document),
    operationFor: (method: string, url: string) =>
      operations.find((operation) => operation.method.toUpperCase() === method.toUpperCase() && operation.url === url),
  };
}

/** A schema node addressed by name in `components.schemas`. */
export function componentSchema(model: ContractModel, name: string): JsonObject | undefined {
  return model.schemas.get(name);
}
