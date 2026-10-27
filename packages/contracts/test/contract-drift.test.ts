import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';

import type { HarnessMockServer } from '../src/node-adapter.js';
import { setupMockServer } from '../src/node-adapter.js';
import type { ContractModel, JsonObject } from '../src/openapi-document.js';
import { asJsonObject, propertySchemaMap, schemaEnumValues, schemaPropertyNames, schemaRequiredNames } from '../src/openapi-document.js';
import {
  ACCOUNT_TYPES,
  EXPORT_FORMATS,
  EXPORT_JOB_STATUSES,
  POSITION_STATUSES,
  SORT_ORDERS,
  errorSchema,
  exportJobSchema,
  exportPositionsRequestSchema,
  instrumentSchema,
  instrumentSearchResponseSchema,
  paginationMetaSchema,
  positionListResponseSchema,
  positionSchema,
} from '../src/schemas.js';
import { DEFAULT_API_ORIGIN, TABLE_QUERY_PARAMETERS, PAGINATION_META_FIELDS, TABLE_SORT_DIRECTIONS } from '../src/index.js';
import { asRecord, asRecordList } from './harness.js';

/**
 * The anti-drift gate.
 *
 * The guards the app runs are hand-written zod; the shapes they describe are
 * authored OpenAPI. Those two only stay equal because this file compares them
 * key by key. Change a `components.schemas` entry without changing its guard,
 * or a guard without its contract, and the suite fails here rather than in a
 * browser at 3am.
 */
interface Guard {
  readonly name: string;
  readonly schema: ZodType;
  /** zod's internal node type per property; `optional` is the only non-required one. */
  shape(): Record<string, unknown>;
}

const guards: Record<string, Guard> = {
  Error: { name: 'errorSchema', schema: errorSchema, shape: () => shapeOf(errorSchema) },
  Position: { name: 'positionSchema', schema: positionSchema, shape: () => shapeOf(positionSchema) },
  PaginationMeta: { name: 'paginationMetaSchema', schema: paginationMetaSchema, shape: () => shapeOf(paginationMetaSchema) },
  PositionListResponse: { name: 'positionListResponseSchema', schema: positionListResponseSchema, shape: () => shapeOf(positionListResponseSchema) },
  ExportJob: { name: 'exportJobSchema', schema: exportJobSchema, shape: () => shapeOf(exportJobSchema) },
  ExportPositionsRequest: { name: 'exportPositionsRequestSchema', schema: exportPositionsRequestSchema, shape: () => shapeOf(exportPositionsRequestSchema) },
  Instrument: { name: 'instrumentSchema', schema: instrumentSchema, shape: () => shapeOf(instrumentSchema) },
  InstrumentSearchResponse: { name: 'instrumentSearchResponseSchema', schema: instrumentSearchResponseSchema, shape: () => shapeOf(instrumentSearchResponseSchema) },
};

/**
 * Read zod's public `shape` of an object schema. zod keeps optionality on the
 * property node's internal `def.type`, which is the only place that separates an
 * optional key from a nullable-but-required one; it is read defensively here so
 * a zod upgrade that moves it fails this file instead of passing silently.
 */
function shapeOf(schema: ZodType): Record<string, unknown> {
  const holder: unknown = schema;
  if (typeof holder !== 'object' || holder === null || !('shape' in holder)) {
    throw new Error('the guard is not an object schema with a readable shape');
  }
  const shape: unknown = (holder as { shape: unknown }).shape;
  return asRecord(shape, 'zod shape');
}

const isOptionalProperty = (node: unknown): boolean => {
  if (typeof node !== 'object' || node === null || !('def' in node)) {
    return false;
  }
  const def: unknown = (node as { def: unknown }).def;
  return typeof def === 'object' && def !== null && 'type' in def && (def as { type: unknown }).type === 'optional';
};

let harness: HarnessMockServer;
let models: readonly ContractModel[] = [];

beforeAll(async () => {
  harness = await setupMockServer({ listen: false });
  models = harness.models;
});

afterAll(() => {
  harness.close();
});

const everyComponent = (): ReadonlyArray<{ model: ContractModel; name: string; schema: JsonObject }> =>
  models.flatMap((model) => [...model.schemas].map(([name, schema]) => ({ model, name, schema })));

describe('contract and guard parity', () => {
  it('mirrors every component every contract declares, and nothing else', () => {
    const declared = new Set(everyComponent().map((entry) => entry.name));
    expect([...declared].sort()).toEqual(Object.keys(guards).sort());
  });

  it('agrees with the contract on every property name', () => {
    for (const { name, schema } of everyComponent()) {
      const guard = guards[name];
      expect(guard, `${name} has no runtime guard`).toBeDefined();
      const contractKeys = schemaPropertyNames(schema).slice().sort();
      const guardKeys = Object.keys(guard?.shape() ?? {}).sort();
      expect(guardKeys, `guards for ${name}`).toEqual(contractKeys);
    }
  });

  it('agrees with the contract on which properties are required', () => {
    for (const { name, schema } of everyComponent()) {
      const guard = guards[name];
      expect(guard, `${name} has no runtime guard`).toBeDefined();
      const shape = guard?.shape() ?? {};
      const contractRequired = schemaRequiredNames(schema).slice().sort();
      const guardRequired = Object.keys(shape)
        .filter((key) => !isOptionalProperty(shape[key]))
        .sort();
      expect(guardRequired, `required keys of ${name}`).toEqual(contractRequired);
    }
  });

  it('is closed under extra properties, exactly like the contract', () => {
    for (const { name, schema } of everyComponent()) {
      expect(schema['additionalProperties'], `${name} must forbid undeclared properties`).toBe(false);
    }
  });

  it('rejects an undeclared property in a real row', () => {
    const firstRow = declaredPositionRow(models);
    expect(positionSchema.safeParse(firstRow).success).toBe(true);
    expect(positionSchema.safeParse({ ...firstRow, unexpected: true }).success).toBe(false);
    expect(positionSchema.safeParse({ ...firstRow, unrealizedPnl: 'not a number' }).success).toBe(false);
    expect(positionSchema.safeParse({ ...firstRow, tradedAt: '14/07/2026' }).success).toBe(false);
  });

  it('declares the same enums the guards accept', () => {
    const dataTable = models[0];
    const position = dataTable ? propertySchemaMap(dataTable.document, dataTable.schemas.get('Position')) : undefined;
    expect(schemaEnumValues(position?.get('status'))).toEqual(POSITION_STATUSES);
    expect(schemaEnumValues(position?.get('accountType'))).toEqual(ACCOUNT_TYPES);

    const exportRequest = dataTable ? propertySchemaMap(dataTable.document, dataTable.schemas.get('ExportPositionsRequest')) : undefined;
    expect(schemaEnumValues(exportRequest?.get('format'))).toEqual(EXPORT_FORMATS);
    const exportJob = dataTable ? propertySchemaMap(dataTable.document, dataTable.schemas.get('ExportJob')) : undefined;
    expect(schemaEnumValues(exportJob?.get('status'))).toEqual(EXPORT_JOB_STATUSES);

    const sortOrder = dataTable ? declaredParameterSchema(dataTable, 'sortOrder') : undefined;
    expect(schemaEnumValues(sortOrder)).toEqual(SORT_ORDERS);
  });

  it('keeps the public table types aligned with the declared parameters', () => {
    const dataTable = models[0];
    const list = dataTable?.operations.find((operation) => operation.operationId === 'listPositions');
    expect(list).toBeDefined();
    expect([...(list?.queryParameters.keys() ?? [])].sort()).toEqual([...TABLE_QUERY_PARAMETERS].sort());
    expect(TABLE_SORT_DIRECTIONS).toEqual(SORT_ORDERS);

    const meta = dataTable && dataTable.schemas.get('PaginationMeta');
    expect(meta ? schemaPropertyNames(meta) : []).toEqual(PAGINATION_META_FIELDS);
  });

  it('serves the origin the package documents, from the servers block', () => {
    for (const model of models) {
      expect(model.serverUrls).toContain(DEFAULT_API_ORIGIN);
      for (const operation of model.operations) {
        expect(operation.url.startsWith(DEFAULT_API_ORIGIN)).toBe(true);
      }
    }
  });

  it('shares one Error definition between the two contracts', () => {
    const [first, second] = models.map((model) => JSON.stringify(model.schemas.get('Error')));
    expect(first).toBeDefined();
    expect(first).toBe(second);
  });
});

/** The schema of one declared query parameter, read from `components.parameters`. */
function declaredParameterSchema(model: ContractModel, name: string): JsonObject | undefined {
  const parameters = asJsonObject(asJsonObject(model.document['components'])?.['parameters']) ?? {};
  for (const parameter of Object.values(parameters)) {
    const entry = asJsonObject(parameter);
    if (entry?.['name'] === name) {
      return asJsonObject(entry['schema']);
    }
  }
  return undefined;
}

/** A row straight out of the contract's own declared dataset. */
function declaredPositionRow(models: readonly ContractModel[]): Record<string, unknown> {
  const model = models[0];
  if (!model) {
    throw new Error('the positions contract is missing');
  }
  const example = model.operations.find((operation) => operation.operationId === 'listPositions')?.mediaOf('200')?.example;
  const rows = asRecordList(asRecord(example, 'PositionsCollection example')['data'], 'data');
  const row = rows[0];
  if (!row) {
    throw new Error('the positions contract declares no rows');
  }
  return row;
}
