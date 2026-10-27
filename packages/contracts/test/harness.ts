/**
 * Shared helpers for the contracts suite.
 *
 * Everything here is about talking to the generated mock the way an app does:
 * a real `fetch` against the origin the contract declares, then proof that the
 * answer is what the contract says it is.
 */
import { expect } from 'vitest';

import type { ContractModel, JsonObject } from '../src/openapi-document.js';
import { contractUrl, documentedMedia } from '../src/handlers.js';
import { assertMatchesSchema } from '../src/testing/openapi-assert.js';
import type { JsonSchema } from '../src/testing/openapi-assert.js';

export interface MockResponse {
  readonly status: number;
  readonly body: unknown;
  readonly contentType: string | null;
}

/** A body that is not JSON (a 501 placeholder, say) stays the text it is. */
function parseBody(text: string): unknown {
  if (text.length === 0) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** `fetch` a contract URL with query parameters applied. */
export async function requestJson(path: string, query?: Readonly<Record<string, string | number>>, init?: RequestInit): Promise<MockResponse> {
  const response = await fetch(contractUrl(path, query), init);
  const text = await response.text();
  return { status: response.status, body: parseBody(text), contentType: response.headers.get('content-type') };
}

/** `fetch` a path with no query parameters at all. */
export async function requestRaw(url: string, init?: RequestInit): Promise<MockResponse> {
  const response = await fetch(url, init);
  const text = await response.text();
  return { status: response.status, body: parseBody(text), contentType: response.headers.get('content-type') };
}

/** The schema a documented response declares, refusing to test against nothing. */
export function documentedSchema(model: ContractModel, operationId: string, status: string): JsonSchema {
  const media = documentedMedia(model, operationId, status);
  const schema = media?.schema;
  if (!schema) {
    throw new Error(`the contract declares no schema for ${operationId} ${status}`);
  }
  return schema;
}

/** The payload a documented response declares. */
export function documentedExample(model: ContractModel, operationId: string, status: string): unknown {
  const media = documentedMedia(model, operationId, status);
  if (!media || media.example === undefined) {
    throw new Error(`the contract declares no example for ${operationId} ${status}`);
  }
  return media.example;
}

/** Prove a mocked body conforms to the contract document it came from. */
export function expectConformsToContract(body: unknown, model: ContractModel, operationId: string, status: string): void {
  assertMatchesSchema(body, documentedSchema(model, operationId, status), {
    document: model.document as unknown as JsonSchema,
    label: `${operationId} ${status}`,
  });
}

/**
 * A row list read out of a mocked body or a declared example. Typed as JSON so a
 * test that edits a row before regenerating keeps the contract's own value types
 * instead of falling back to `unknown`.
 */
export function asRecordList(value: unknown, label: string): readonly JsonObject[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} is not an array`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`${label}[${String(index)}] is not an object`);
    }
    return entry as JsonObject;
  });
}

export function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} is not an object`);
  }
  return value as Record<string, unknown>;
}

/** Column of a row set as strings, for order assertions. */
export function column(rows: readonly Record<string, unknown>[], name: string): readonly string[] {
  return rows.map((row) => String(row[name]));
}

export function numberColumn(rows: readonly Record<string, unknown>[], name: string): readonly number[] {
  return rows.map((row) => {
    const value = row[name];
    if (typeof value !== 'number') {
      throw new Error(`${name} is not a number: ${String(value)}`);
    }
    return value;
  });
}

export const expectJsonObject = (value: unknown, label: string): JsonObject => asRecord(value, label) as JsonObject;

export const expectOk = (response: MockResponse): void => {
  expect(response.status).toBe(200);
  expect(response.contentType).toContain('application/json');
};
