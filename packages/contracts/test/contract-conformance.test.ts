import { beforeAll, describe, expect, it } from 'vitest';

import type { ContractModel } from '../src/openapi-document.js';
import { analyzeContract, collectRefs, propertySchemaMap, resolvePointer } from '../src/openapi-document.js';
import { contractDocuments } from '../src/node-adapter.js';
import { documentedSchema } from './harness.js';
import { asRecord, asRecordList } from './harness.js';
import {
  errorSchema,
  exportJobSchema,
  instrumentSchema,
  instrumentSearchResponseSchema,
  positionListResponseSchema,
  positionSchema,
} from '../src/schemas.js';
import { validateSchema } from '../src/testing/openapi-assert.js';

/**
 * The contract has to be honest about itself before the harness can hold
 * anybody else to it: every example it declares must satisfy the schema it
 * declares, every reference must resolve, and the zod guards must accept the
 * same payloads. A failure here means the document disagrees with itself — the
 * same defect whether a backend or a mock produces it.
 */
let positions: ContractModel;
let instruments: ContractModel;

beforeAll(() => {
  const models = contractDocuments().map((document) => analyzeContract(document));
  const [first, second] = models;
  if (!first || !second) {
    throw new Error('both contract documents are expected');
  }
  positions = first;
  instruments = second;
});

const operationOf = (model: ContractModel, operationId: string) => {
  const operation = model.operations.find((candidate) => candidate.operationId === operationId);
  if (!operation) {
    throw new Error(`${operationId} is not declared by the contract`);
  }
  return operation;
};

describe('contract self-consistency', () => {
  it('is a 3.1 document that resolves all of its own references', () => {
    for (const model of [positions, instruments]) {
      expect(model.openapi).toMatch(/^3\.1\./);
      expect(model.title).toBeTruthy();
      const refs = collectRefs(model.document);
      expect(refs.length, `${model.title} declares no references at all`).toBeGreaterThan(0);
      // A `$ref` is a JSON pointer, so it is resolved as one: taking the token at
      // index 1 of `#/components/schemas/Position` is `components`, not the schema
      // section, and every reference in the document looks broken.
      const broken = refs.filter((entry) => resolvePointer(model.document, entry.ref) === undefined);
      expect(broken, `${model.title} has dangling references`).toEqual([]);
    }
  });

  it('declares a dataset big enough to page, sort and search through', () => {
    const example = asRecord(operationOf(positions, 'listPositions').mediaOf('200')?.example, 'list example');
    const rows = asRecordList(example['data'], 'data');
    expect(rows.length).toBeGreaterThanOrEqual(24);
    expect(new Set(rows.map((row) => row['symbol'])).size).toBe(rows.length);
    expect(rows.some((row) => Number(row['unrealizedPnl']) < 0)).toBe(true);
    expect(rows.every((row) => typeof row['tradedAt'] === 'string')).toBe(true);
    expect(asRecord(example['meta'], 'meta')['total']).toBe(rows.length);
  });

  it('serves example payloads that conform to their own declared schemas', () => {
    let checked = 0;
    for (const model of [positions, instruments]) {
      for (const operation of model.operations) {
        for (const status of operation.documentedStatuses) {
          const schema = operation.mediaOf(status)?.schema;
          const example = operation.mediaOf(status)?.example;
          if (!schema || example === undefined) {
            continue;
          }
          const result = validateSchema(example, schema, { document: model.document });
          expect(result.issues, `${operation.operationId} ${status}`).toEqual([]);
          checked += 1;
        }
      }
    }
    // Every documented response of every operation carries both a schema and a
    // payload, so nothing above is silently skipped.
    expect(checked).toBe(positions.operations.reduce((total, operation) => total + operation.documentedStatuses.size, 0) + instruments.operations.reduce((total, operation) => total + operation.documentedStatuses.size, 0));
  });

  it('keeps the guards and the contract in agreement on declared payloads', () => {
    const listExample = asRecord(operationOf(positions, 'listPositions').mediaOf('200')?.example, 'list example');
    expect(positionListResponseSchema.safeParse(listExample).success).toBe(true);
    expect(asRecordList(listExample['data'], 'data').every((row) => positionSchema.safeParse(row).success)).toBe(true);

    const searchExample = asRecord(operationOf(instruments, 'searchInstruments').mediaOf('200')?.example, 'search example');
    expect(instrumentSearchResponseSchema.safeParse(searchExample).success).toBe(true);
    expect(asRecordList(searchExample['items'], 'items').every((item) => instrumentSchema.safeParse(item).success)).toBe(true);

    const jobExample = operationOf(positions, 'exportPositions').mediaOf('202')?.example;
    expect(exportJobSchema.safeParse(jobExample).success).toBe(true);
    expect(errorSchema.safeParse(operationOf(positions, 'listPositions').mediaOf('422')?.example).success).toBe(true);
    expect(errorSchema.safeParse(operationOf(instruments, 'getInstrument').mediaOf('404')?.example).success).toBe(true);
  });

  it('describes every property it declares', () => {
    for (const model of [positions, instruments]) {
      for (const [name, schema] of model.schemas) {
        expect(typeof schema['description'], `${name} needs a description`).toBe('string');
        for (const [field, child] of propertySchemaMap(model.document, schema)) {
          expect(typeof child['description'], `${name}.${field} needs a description`).toBe('string');
        }
      }
    }
  });

  it('reads documented response schemas out of the document, not out of a copy', () => {
    const schema = documentedSchema(positions, 'listPositions', '200');
    const properties = asRecord(schema['properties'] ?? {}, 'listProperties');
    expect(Object.keys(properties).sort()).toEqual(['data', 'meta']);
    expect(() => documentedSchema(positions, 'listPositions', '418')).toThrow(/declares no schema/);
    expect(() => documentedSchema(positions, 'noSuchOperation', '200')).toThrow(/no schema/);
  });
});
