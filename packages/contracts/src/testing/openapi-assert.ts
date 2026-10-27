/**
 * Dependency-free validator for the JSON Schema subset the harness contracts use.
 *
 * OpenAPI 3.1 aligns with JSON Schema 2020-12, but the contracts only ever use a
 * fixed set of keywords, so this module implements exactly that set instead of
 * pulling a validator (ajv or similar) into the delivery layer: every keyword
 * below is one the contracts are allowed to express, and `assertMatchesSchema`
 * refuses an unsupported keyword rather than silently ignoring it. That keeps
 * "the mocked response conforms to the contract" a claim the harness can prove.
 *
 * Supported keywords: `$ref` (document-local JSON pointers), `type` (single type
 * or an array of types, including `"null"` — the 3.1 nullable idiom), `required`,
 * `properties`, `additionalProperties`, `items`, `enum`, `const`, `format`,
 * `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `minLength`,
 * `maxLength`, `pattern`, `minItems`, `maxItems`, `uniqueItems`, `allOf`,
 * `anyOf`, `oneOf`, `not`.
 */

/** A JSON Schema / OpenAPI schema node as parsed from the contract. */
export type JsonSchema = { readonly [keyword: string]: unknown };

/** A single conformance failure, addressed by a `meta.data[0].value` style path. */
export interface ValidationIssue {
  readonly path: string;
  readonly keyword: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

export interface ValidatorOptions {
  /**
   * The document local `$ref`s resolve against. Pass the OpenAPI document when
   * validating a schema node that was read out of it; when omitted the schema
   * node is its own document and any `$ref` reports an unresolvable reference.
   */
  readonly document?: JsonSchema;
}

const SUPPORTED_KEYWORDS: readonly string[] = [
  '$ref',
  'type',
  'required',
  'properties',
  'additionalProperties',
  'items',
  'enum',
  'const',
  'format',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minLength',
  'maxLength',
  'pattern',
  'minItems',
  'maxItems',
  'uniqueItems',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
];

/** Every keyword this validator understands, for contract authoring and tests. */
export const supportedKeywords: readonly string[] = SUPPORTED_KEYWORDS;

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const URI_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:\S*$/;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;

const FORMAT_CHECKS: Readonly<Record<string, (value: string) => boolean>> = {
  uuid: (value) => UUID_PATTERN.test(value),
  date: (value) => DATE_PATTERN.test(value) && Number.isFinite(Date.parse(value)),
  'date-time': (value) => DATE_TIME_PATTERN.test(value) && Number.isFinite(Date.parse(value)),
  uri: (value) => URI_PATTERN.test(value),
  'uri-reference': (value) => value.length > 0,
  email: (value) => EMAIL_PATTERN.test(value),
};

interface ValidationContext {
  readonly schema: JsonSchema;
  readonly document: JsonSchema;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asSchema = (value: unknown): JsonSchema | undefined => (isPlainObject(value) ? (value as JsonSchema) : undefined);

const asSchemaList = (value: unknown): JsonSchema[] => (Array.isArray(value) ? value.filter((item): item is JsonSchema => isPlainObject(item)) : []);

const jsonNameOf = (value: null | number | string): string => (typeof value === 'string' ? `"${value}"` : JSON.stringify(value));

const typeNameOf = (value: unknown): string => {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (Number.isInteger(value)) {
    return 'integer';
  }
  return typeof value;
};

const hasOwnKey = (schema: JsonSchema, keyword: string): boolean => Object.prototype.hasOwnProperty.call(schema, keyword);

/**
 * Resolve a document-local JSON pointer (`#/components/schemas/Position`) into
 * the schema node it addresses. `~0` and `~1` escapes are honoured; anything
 * that is not a local pointer, or that does not resolve, yields `undefined`.
 */
export function resolveRef(document: JsonSchema, ref: string): JsonSchema | undefined {
  if (!ref.startsWith('#/')) {
    return undefined;
  }
  let current: unknown = document;
  for (const rawToken of ref.slice(2).split('/')) {
    const token = rawToken.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!isPlainObject(current) && !Array.isArray(current)) {
      return undefined;
    }
    const next: unknown = (current as Record<string, unknown>)[token];
    if (next === undefined) {
      return undefined;
    }
    current = next;
  }
  return asSchema(current);
}

function jsonEquals(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => jsonEquals(item, right[index]));
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every((key, index) => key === rightKeys[index] && jsonEquals(left[key], right[key]))
    );
  }
  // JSON makes no difference between 1 and 1.0.
  if (typeof left === 'number' && typeof right === 'number') {
    return left === right;
  }
  return false;
}

function checkType(value: unknown, declared: unknown): boolean {
  const accepted: readonly unknown[] = Array.isArray(declared) ? declared : [declared];
  return accepted.some((entry) => {
    switch (entry) {
      case 'object':
        return isPlainObject(value);
      case 'array':
        return Array.isArray(value);
      case 'null':
        return value === null;
      case 'boolean':
        return typeof value === 'boolean';
      case 'integer':
        return typeof value === 'number' && Number.isInteger(value);
      case 'number':
        return typeof value === 'number' && Number.isFinite(value);
      case 'string':
        return typeof value === 'string';
      default:
        return false;
    }
  });
}

function fail(issues: ValidationIssue[], path: string, keyword: string, message: string): void {
  issues.push({ path, keyword, message });
}

/**
 * Keywords that annotate a schema without constraining the value, plus any
 * `x-` extension: they may appear in a contract without tripping the subset
 * check. Anything else that this validator does not implement is a failure,
 * because ignoring a constraint is how a mock starts lying.
 */
const ANNOTATION_KEYWORDS: readonly string[] = [
  'description',
  'summary',
  'title',
  'default',
  'examples',
  'example',
  'deprecated',
  'readOnly',
  'writeOnly',
  'definitions',
  '$defs',
  '$schema',
  '$id',
];

function validateNode(value: unknown, context: ValidationContext, path: string, issues: ValidationIssue[], refTrail: readonly string[]): void {
  const { schema, document } = context;

  for (const keyword of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.includes(keyword)) {
      const isAnnotation = ANNOTATION_KEYWORDS.includes(keyword) || keyword.startsWith('x-');
      if (!isAnnotation) {
        fail(issues, path, keyword, `unsupported keyword "${keyword}" is outside the contract validator subset`);
      }
    }
  }

  const ref = schema['$ref'];
  if (typeof ref === 'string') {
    if (refTrail.includes(ref)) {
      return;
    }
    const target = resolveRef(document, ref);
    if (!target) {
      fail(issues, path, '$ref', `cannot resolve reference "${ref}" against the supplied document`);
      return;
    }
    validateNode(value, { schema: target, document }, path, issues, [...refTrail, ref]);
  }

  const declaredType = schema['type'];
  if (declaredType !== undefined && !checkType(value, declaredType)) {
    const expected = Array.isArray(declaredType) ? declaredType.map(String).join(' | ') : String(declaredType);
    fail(issues, path, 'type', `expected ${expected} but received ${typeNameOf(value)}`);
    return;
  }

  const enumValues = schema['enum'];
  if (Array.isArray(enumValues) && !enumValues.some((option) => jsonEquals(option, value))) {
    fail(issues, path, 'enum', `expected one of ${enumValues.map((option) => jsonNameOf(option as null | number | string)).join(', ')} but received ${jsonNameOf(value as null | number | string)}`);
  }

  if (hasOwnKey(schema, 'const') && !jsonEquals(schema['const'], value)) {
    fail(issues, path, 'const', `expected the constant ${jsonNameOf(schema['const'] as null | number | string)}`);
  }

  if (typeof value === 'string') {
    validateString(value, schema, path, issues);
  }

  if (typeof value === 'number') {
    validateNumber(value, schema, path, issues);
  }

  if (Array.isArray(value)) {
    validateArray(value, schema, path, issues, refTrail, document);
  }

  if (isPlainObject(value)) {
    validateObject(value, schema, path, issues, refTrail, document);
  }

  for (const branch of asSchemaList(schema['allOf'])) {
    validateNode(value, { schema: branch, document }, path, issues, refTrail);
  }

  const anyOf = asSchemaList(schema['anyOf']);
  if (anyOf.length > 0) {
    const matched = anyOf.some((branch) => validateNodeQuietly(value, { schema: branch, document }, refTrail));
    if (!matched) {
      fail(issues, path, 'anyOf', 'value matches none of the anyOf branches');
    }
  }

  const oneOf = asSchemaList(schema['oneOf']);
  if (oneOf.length > 0) {
    const matches = oneOf.filter((branch) => validateNodeQuietly(value, { schema: branch, document }, refTrail)).length;
    if (matches !== 1) {
      fail(issues, path, 'oneOf', `expected exactly one matching branch but found ${String(matches)}`);
    }
  }

  const not = asSchema(schema['not']);
  if (not && validateNodeQuietly(value, { schema: not, document }, refTrail)) {
    fail(issues, path, 'not', 'value must not match the "not" schema');
  }
}

function validateNodeQuietly(value: unknown, context: ValidationContext, refTrail: readonly string[]): boolean {
  const collected: ValidationIssue[] = [];
  validateNode(value, context, '$', collected, refTrail);
  return collected.length === 0;
}

function validateString(value: string, schema: JsonSchema, path: string, issues: ValidationIssue[]): void {
  const minLength = schema['minLength'];
  if (typeof minLength === 'number' && value.length < minLength) {
    fail(issues, path, 'minLength', `expected at least ${String(minLength)} characters but received ${String(value.length)}`);
  }
  const maxLength = schema['maxLength'];
  if (typeof maxLength === 'number' && value.length > maxLength) {
    fail(issues, path, 'maxLength', `expected at most ${String(maxLength)} characters but received ${String(value.length)}`);
  }
  const pattern = schema['pattern'];
  if (typeof pattern === 'string' && !new RegExp(pattern, 'u').test(value)) {
    fail(issues, path, 'pattern', `"${value}" does not match ${pattern}`);
  }
  const format = schema['format'];
  if (typeof format === 'string') {
    const check = FORMAT_CHECKS[format];
    if (check && !check(value)) {
      fail(issues, path, 'format', `"${value}" is not a valid ${format}`);
    }
  }
}

function validateNumber(value: number, schema: JsonSchema, path: string, issues: ValidationIssue[]): void {
  const minimum = schema['minimum'];
  if (typeof minimum === 'number' && value < minimum) {
    fail(issues, path, 'minimum', `expected >= ${String(minimum)} but received ${String(value)}`);
  }
  const maximum = schema['maximum'];
  if (typeof maximum === 'number' && value > maximum) {
    fail(issues, path, 'maximum', `expected <= ${String(maximum)} but received ${String(value)}`);
  }
  const exclusiveMinimum = schema['exclusiveMinimum'];
  if (typeof exclusiveMinimum === 'number' && value <= exclusiveMinimum) {
    fail(issues, path, 'exclusiveMinimum', `expected > ${String(exclusiveMinimum)} but received ${String(value)}`);
  }
  const exclusiveMaximum = schema['exclusiveMaximum'];
  if (typeof exclusiveMaximum === 'number' && value >= exclusiveMaximum) {
    fail(issues, path, 'exclusiveMaximum', `expected < ${String(exclusiveMaximum)} but received ${String(value)}`);
  }
}

function validateArray(value: readonly unknown[], schema: JsonSchema, path: string, issues: ValidationIssue[], refTrail: readonly string[], document: JsonSchema): void {
  const minItems = schema['minItems'];
  if (typeof minItems === 'number' && value.length < minItems) {
    fail(issues, path, 'minItems', `expected at least ${String(minItems)} items but received ${String(value.length)}`);
  }
  const maxItems = schema['maxItems'];
  if (typeof maxItems === 'number' && value.length > maxItems) {
    fail(issues, path, 'maxItems', `expected at most ${String(maxItems)} items but received ${String(value.length)}`);
  }
  if (schema['uniqueItems'] === true) {
    const seen: unknown[] = [];
    for (const [index, item] of value.entries()) {
      if (seen.some((previous) => jsonEquals(previous, item))) {
        fail(issues, `${path}[${String(index)}]`, 'uniqueItems', 'items must be unique');
      }
      seen.push(item);
    }
  }
  const items = asSchema(schema['items']);
  if (items) {
    for (const [index, item] of value.entries()) {
      validateNode(item, { schema: items, document }, `${path}[${String(index)}]`, issues, refTrail);
    }
  }
}

function validateObject(value: Readonly<Record<string, unknown>>, schema: JsonSchema, path: string, issues: ValidationIssue[], refTrail: readonly string[], document: JsonSchema): void {
  const required = schema['required'];
  if (Array.isArray(required)) {
    for (const key of required) {
      if (typeof key === 'string' && !Object.prototype.hasOwnProperty.call(value, key)) {
        fail(issues, path === '$' ? `$.${key}` : `${path}.${key}`, 'required', `missing required property "${key}"`);
      }
    }
  }

  const properties = asSchema(schema['properties']);
  const additional = schema['additionalProperties'];
  const additionalSchema = additional === false || additional === true ? undefined : asSchema(additional);

  for (const [key, child] of Object.entries(value)) {
    const childSchema = properties ? asSchema(properties[key]) : undefined;
    if (childSchema) {
      validateNode(child, { schema: childSchema, document }, `${path}.${key}`, issues, refTrail);
      continue;
    }
    if (additional === false) {
      fail(issues, `${path}.${key}`, 'additionalProperties', `unexpected property "${key}" is not declared by the contract`);
      continue;
    }
    if (additionalSchema) {
      validateNode(child, { schema: additionalSchema, document }, `${path}.${key}`, issues, refTrail);
    }
  }
}

/** Validate a value against a contract schema node. */
export function validateSchema(value: unknown, schema: JsonSchema, options: ValidatorOptions = {}): ValidationResult {
  const issues: ValidationIssue[] = [];
  validateNode(value, { schema, document: options.document ?? schema }, '$', issues, []);
  return { valid: issues.length === 0, issues };
}

/** Raised by {@link assertMatchesSchema} when a value does not conform. */
export class ContractAssertionError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(label: string, issues: readonly ValidationIssue[]) {
    const detail = issues.map((issue) => `  - ${issue.path}: ${issue.message} (${issue.keyword})`).join('\n');
    super(`${label} does not conform to the contract:\n${detail}`);
    this.name = 'ContractAssertionError';
    this.issues = issues;
  }
}

/**
 * Throw unless `value` conforms to `schema`. Used by the contracts tests and by
 * consumers that want the mocked response proven against the OpenAPI document
 * rather than against a hand-kept type.
 */
export function assertMatchesSchema(value: unknown, schema: JsonSchema, options: ValidatorOptions & { readonly label?: string }): void {
  const result = validateSchema(value, schema, options);
  if (!result.valid) {
    throw new ContractAssertionError(options.label ?? 'value', result.issues);
  }
}
