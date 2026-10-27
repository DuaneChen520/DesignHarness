/**
 * Shared fixture for the registry suite: build once into a throwaway directory and hand
 * the callers both the in-memory model and the bytes that landed on disk, so every test
 * asserts against a real build rather than a canned document.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRegistry, writeRegistry } from '../src/build.js';
import type { BuiltRegistry } from '../src/build.js';
import type { RegistryItemDocument } from '../src/schema.js';

export interface RegistryFixture {
  readonly built: BuiltRegistry;
  readonly dir: string;
  read(relativePath: string): Promise<string>;
  readJson<T = unknown>(relativePath: string): Promise<T>;
  cleanup(): Promise<void>;
}

export async function buildFixture(baseUrl = 'http://127.0.0.1:1/registry.json'): Promise<RegistryFixture> {
  const dir = await mkdtemp(join(tmpdir(), 'designharness-registry-'));
  const built = await buildRegistry({ outputDir: dir, baseUrl });
  await writeRegistry(built, dir);
  return {
    built,
    dir,
    read: (relativePath) => readFile(join(dir, relativePath), 'utf8'),
    readJson: async <T,>(relativePath: string): Promise<T> => JSON.parse(await readFile(join(dir, relativePath), 'utf8')) as T,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

export function itemsOfType(built: BuiltRegistry, type: string): RegistryItemDocument[] {
  return built.items.filter((item) => item.type === type);
}

export function itemByName(built: BuiltRegistry, name: string): RegistryItemDocument {
  const found = built.items.find((item) => item.name === name);
  if (found === undefined) throw new Error(`the built registry has no item named "${name}"`);
  return found;
}
