/**
 * Node-side contract loading.
 *
 * The authored documents are the source of truth, so in tests and tooling they
 * are read straight off disk rather than imported, which keeps a stale
 * `dist/` copy from ever being mistaken for the contract. Browser bundles skip
 * this module entirely and pass the documents they imported from
 * `@designharness/contracts/openapi/*` themselves.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { JsonObject } from './openapi-document.js';

/** Every location the contracts can live in, from `src/`, `dist/` and a pack. */
const CONTRACT_LOCATIONS: readonly URL[] = [new URL('../openapi/', import.meta.url), new URL('./openapi/', import.meta.url)];

export interface LoadedDocument {
  readonly fileName: string;
  readonly absolutePath: string;
  readonly document: JsonObject;
}

/** Resolve one authored contract file to an absolute path. */
export function resolveContractPath(fileName: string): string {
  const tried: string[] = [];
  for (const location of CONTRACT_LOCATIONS) {
    const candidate = fileURLToPath(new URL(fileName, location));
    tried.push(candidate);
    try {
      readFileSync(candidate, 'utf8');
      return candidate;
    } catch {
      // try the next location
    }
  }
  throw new Error(`contracts: "${fileName}" was not found. Looked in:\n${tried.map((path) => `  - ${path}`).join('\n')}`);
}

/** Read and parse one authored contract. */
export function loadContractDocument(fileName: string): LoadedDocument {
  const absolutePath = resolveContractPath(fileName);
  const source = readFileSync(absolutePath, 'utf8');
  const parsed: unknown = JSON.parse(source);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`contracts: ${absolutePath} is not a JSON object`);
  }
  return { fileName, absolutePath, document: parsed as JsonObject };
}

/** Read every authored contract in the given order. */
export function loadContractDocuments(fileNames: readonly string[]): readonly JsonObject[] {
  return fileNames.map((fileName) => loadContractDocument(fileName).document);
}
