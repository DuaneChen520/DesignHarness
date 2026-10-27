import { describe, expect, it } from 'vitest';

import { assertMatchesSchema, ContractAssertionError, resolveRef, supportedKeywords, validateSchema } from '../src/testing/openapi-assert.js';
import type { JsonSchema } from '../src/testing/openapi-assert.js';

/**
 * Unit tests for the dependency-free validator. It has to be trusted before
 * anything is asserted with it, so every keyword it claims to support is
 * exercised here, including the OpenAPI 3.1 idioms the contracts rely on.
 */
const document: JsonSchema = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', format: 'uuid' },
    label: { type: 'string', minLength: 1 },
    group: { type: ['string', 'null'] },
    weight: { type: 'number', minimum: 0, maximum: 100 },
    count: { type: 'integer', exclusiveMinimum: 0 },
    status: { type: 'string', enum: ['open', 'closed'] },
    kind: { const: 'position' },
    tradedAt: { type: 'string', format: 'date-time' },
    tags: { type: 'array', items: { type: 'string' }, minItems: 1, uniqueItems: true },
    nested: { $ref: '#/definitions/Nested' },
    either: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    symbol: { type: 'string', pattern: '^[A-Z]+$' },
  },
  definitions: {
    Nested: {
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string' } },
    },
  },
};

const check = (value: unknown): { valid: boolean; keywords: readonly string[] } => {
  const result = validateSchema(value, document, { document });
  return { valid: result.valid, keywords: result.issues.map((issue) => issue.keyword) };
};

describe('validateSchema', () => {
  it('accepts a value that conforms', () => {
    expect(
      check({
        id: '3f7b2c1d-8a4e-4c0f-9d21-5b6a7c8d9e01',
        label: 'AAPL',
        group: null,
        weight: 8.2,
        count: 3,
        status: 'open',
        kind: 'position',
        tradedAt: '2026-07-14T13:26:00Z',
        tags: ['core'],
        nested: { name: 'inner' },
        either: null,
        symbol: 'ABC',
      }),
    ).toEqual({ valid: true, keywords: [] });
  });

  it('reports the path and keyword of every violation', () => {
    const result = validateSchema({ id: 'not-a-uuid', label: '', weight: 120, count: 0, status: 'frozen', tags: [], nested: {}, symbol: 'abc' }, document, { document });
    expect(result.valid).toBe(false);
    const reported = result.issues.map((issue) => `${issue.path}:${issue.keyword}`);
    expect(reported).toEqual(expect.arrayContaining(['$.id:format', '$.label:minLength', '$.weight:maximum', '$.count:exclusiveMinimum', '$.status:enum', '$.tags:minItems', '$.nested.name:required', '$.symbol:pattern']));
  });

  it('treats required and additionalProperties as object constraints', () => {
    expect(check({ label: 'x' }).keywords).toContain('required');
    expect(check({ id: '3f7b2c1d-8a4e-4c0f-9d21-5b6a7c8d9e01', extra: 1 }).keywords).toContain('additionalProperties');
  });

  it('supports the 3.1 nullable type array', () => {
    expect(check({ id: '3f7b2c1d-8a4e-4c0f-9d21-5b6a7c8d9e01', label: 'a', group: null }).valid).toBe(true);
    expect(check({ id: '3f7b2c1d-8a4e-4c0f-9d21-5b6a7c8d9e01', label: 'a', group: 3 }).keywords).toContain('type');
  });

  it('distinguishes integer from number', () => {
    expect(validateSchema(1.5, { type: 'integer' }).valid).toBe(false);
    expect(validateSchema(2, { type: 'integer' }).valid).toBe(true);
    expect(validateSchema(2, { type: 'number' }).valid).toBe(true);
    expect(validateSchema('2', { type: 'number' }).valid).toBe(false);
  });

  it('validates formats it knows and ignores formats it does not', () => {
    expect(validateSchema('2026-13-45T99:99:99Z', { type: 'string', format: 'date-time' }).valid).toBe(false);
    expect(validateSchema('2026-07-14T13:26:00.512+02:00', { type: 'string', format: 'date-time' }).valid).toBe(true);
    expect(validateSchema('nope', { type: 'string', format: 'uuid' }).valid).toBe(false);
    expect(validateSchema('https://example.test/a', { type: 'string', format: 'uri' }).valid).toBe(true);
    expect(validateSchema('whatever', { type: 'string', format: 'hostname-without-dots' }).valid).toBe(true);
  });

  it('walks arrays and nested $ref chains', () => {
    expect(validateSchema(['a', 'b'], { type: 'array', items: { type: 'string' } }, { document }).valid).toBe(true);
    expect(validateSchema(['a', 2], { type: 'array', items: { type: 'string' } }, { document }).valid).toBe(false);
    expect(resolveRef(document, '#/definitions/Nested')).toEqual({ type: 'object', required: ['name'], properties: { name: { type: 'string' } } });
    expect(resolveRef(document, '#/definitions/Missing')).toBeUndefined();
    expect(resolveRef(document, 'https://example.test#/definitions/Nested')).toBeUndefined();
  });

  it('applies composition keywords', () => {
    expect(validateSchema(1, { anyOf: [{ type: 'string' }, { type: 'number' }] }).valid).toBe(true);
    expect(validateSchema(true, { anyOf: [{ type: 'string' }, { type: 'number' }] }).valid).toBe(false);
    expect(validateSchema(1, { oneOf: [{ type: 'string' }, { type: 'number' }] }).valid).toBe(true);
    expect(validateSchema(1, { oneOf: [{ type: 'number' }, { const: 1 }] }).valid).toBe(false);
    expect(validateSchema('x', { allOf: [{ type: 'string' }, { minLength: 2 }] }).valid).toBe(false);
    expect(validateSchema('x', { not: { type: 'number' } }).valid).toBe(true);
  });

  it('reports a keyword it does not implement instead of ignoring it', () => {
    const result = validateSchema('x', { type: 'string', dependentRequired: { a: ['b'] } });
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.keyword)).toContain('dependentRequired');
  });

  it('never loops on a recursive schema', () => {
    const recursive: JsonSchema = {
      type: 'object',
      properties: { node: { $ref: '#/definitions/Tree' } },
      definitions: { Tree: { type: 'object', properties: { node: { $ref: '#/definitions/Tree' } } } },
    };
    expect(validateSchema({ node: { node: {} } }, recursive, { document: recursive }).valid).toBe(true);
  });
});

describe('assertMatchesSchema', () => {
  it('throws a readable error listing every issue', () => {
    expect(() => assertMatchesSchema({ id: 'nope' }, document, { document, label: 'instrument' })).toThrow(ContractAssertionError);
    expect(() => assertMatchesSchema({ id: 'nope' }, document, { document, label: 'instrument' })).toThrow(/instrument does not conform to the contract/);
    expect(() => assertMatchesSchema({ id: 'nope' }, document, { document, label: 'instrument' })).toThrow(/id: "nope" is not a valid uuid/);
    expect(() => assertMatchesSchema({ id: '3f7b2c1d-8a4e-4c0f-9d21-5b6a7c8d9e01' }, document, { document })).not.toThrow();
  });

  it('documents the subset it implements', () => {
    for (const keyword of ['$ref', 'type', 'required', 'properties', 'additionalProperties', 'items', 'enum', 'const', 'format']) {
      expect(supportedKeywords).toContain(keyword);
    }
  });
});
