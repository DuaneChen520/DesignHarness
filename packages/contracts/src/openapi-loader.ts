/**
 * Node-side contract loading.
 *
 * The authored documents are the source of truth, so in tests and tooling they
 * are read straight off disk rather than imported, which keeps a stale
 * `dist/` copy from ever being mistaken for the contract. Browser bundles skip
 * this module entirely and pass the documents they imported from
 * `@designharness/contracts/openapi/*` themselves.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { JsonObject } from './openapi-document.js';

export interface LoadedDocument {
  readonly fileName: string;
  readonly absolutePath: string;
  readonly document: JsonObject;
}

/** Resolve one authored contract file to an absolute path. */
export function resolveContractPath(fileName: string): string {
  const tried: string[] = [];
  
  // Try relative to import.meta.url
  if (typeof import.meta.url === 'string' && import.meta.url.startsWith('file:')) {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const locations = [
      resolve(currentDir, '..', 'openapi', fileName),
      resolve(currentDir, 'openapi', fileName),
    ];
    for (const candidate of locations) {
      tried.push(candidate);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  // Fallback checking process.cwd() or known repo locations
  const cwdCandidates = [
    resolve(process.cwd(), 'openapi', fileName),
    resolve(process.cwd(), 'packages', 'contracts', 'openapi', fileName),
    resolve(process.cwd(), '..', 'openapi', fileName),
  ];
  for (const candidate of cwdCandidates) {
    tried.push(candidate);
    if (existsSync(candidate)) {
      return candidate;
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
