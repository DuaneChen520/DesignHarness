/**
 * What `npx shadcn add https://…/registry.json` actually does, replayed in-process:
 * read the index, pick an item by name, follow every `registryDependencies` entry until
 * the graph closes, then install each `dependencies` package and write each file.
 *
 * A registry that only looks right when you read it by hand is not a registry.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RegistryIndex } from '@designharness/engine';
import { BASE_ITEM_NAME, STYLE_ITEM_NAME } from '../src/build.js';
import type { RegistryItemDocument } from '../src/schema.js';
import { registryItemsDirName } from '../src/paths.js';
import { buildFixture, itemsOfType } from './fixture.js';
import type { RegistryFixture } from './fixture.js';

let fixture: RegistryFixture;
let index: RegistryIndex;

beforeAll(async () => {
  fixture = await buildFixture('https://design-harness.internal');
  index = await fixture.readJson<RegistryIndex>('registry.json');
});

afterAll(async () => {
  await fixture.cleanup();
});

/** Resolve an item exactly like the CLI does: by name, out of `r/<name>.json`. */
async function resolveItem(name: string): Promise<RegistryItemDocument> {
  const item = await fixture.readJson<RegistryItemDocument>(`${registryItemsDirName}/${name}.json`);
  return item;
}

/** Transitive closure of one install request. */
async function closure(root: string): Promise<string[]> {
  const seen = new Set<string>();
  const queue = [root];
  while (queue.length > 0) {
    const name = queue.shift();
    if (name === undefined || seen.has(name)) continue;
    seen.add(name);
    const item = await resolveItem(name);
    queue.push(...(item.registryDependencies ?? []));
  }
  return [...seen].sort();
}

describe('item resolution', () => {
  it('resolves every component by name from the index', async () => {
    const names = index.items.map((item) => item.name);
    for (const component of itemsOfType(fixture.built, 'registry:component')) {
      expect(names).toContain(String(component.name));
      const resolved = await resolveItem(String(component.name));
      expect(resolved.name).toBe(component.name);
      expect(resolved.type).toBe('registry:component');
      expect(resolved.files?.length).toBeGreaterThan(0);
    }
  });

  it('indexes an item whose payload document agrees with it', async () => {
    for (const entry of index.items) {
      const resolved = await resolveItem(entry.name);
      expect(resolved.type).toBe(entry.type);
      expect(resolved.registryDependencies ?? []).toEqual(entry.registryDependencies ?? []);
    }
  });
});

describe('dependency graph', () => {
  it('references meridian-base from every component item', () => {
    const components = itemsOfType(fixture.built, 'registry:component');
    expect(components.length).toBeGreaterThan(0);
    for (const component of components) {
      expect(component.registryDependencies ?? [], `${String(component.name)} does not depend on the base`).toContain(BASE_ITEM_NAME);
    }
  });

  it('resolves every registryDependencies name inside the registry', async () => {
    const known = new Set(index.items.map((item) => item.name));
    for (const item of fixture.built.items) {
      for (const dependency of item.registryDependencies ?? []) {
        expect(known.has(dependency), `${String(item.name)} -> ${dependency} is unresolvable`).toBe(true);
        const resolved = await resolveItem(dependency);
        expect(resolved.name).toBe(dependency);
      }
    }
  });

  it('closes the graph at the base item without cycles', async () => {
    const installed = await closure('button');
    expect(installed).toEqual(['button', BASE_ITEM_NAME]);
    const everything = await closure(STYLE_ITEM_NAME);
    expect(everything.length).toBe(index.totalItems);
    // The base item is a leaf: it must not drag the whole graph back onto itself.
    const base = await resolveItem(BASE_ITEM_NAME);
    expect(base.registryDependencies ?? []).toEqual([]);
  });

  it('declares npm dependencies as package names a installer can consume', () => {
    for (const item of itemsOfType(fixture.built, 'registry:component')) {
      const dependencies = item.dependencies ?? [];
      expect(dependencies).toContain('react');
      expect(dependencies).toContain('@designharness/primitives');
      for (const dependency of dependencies) {
        expect(dependency).toMatch(/^(?:@[a-z0-9-]+\/)?[a-z0-9-]+$/);
        expect(dependency).not.toMatch(/^http/);
      }
    }
  });

  it('writes files that do not collide across items with different content', async () => {
    const byPath = new Map<string, Set<string>>();
    for (const item of fixture.built.items) {
      const resolved = await resolveItem(String(item.name));
      for (const file of resolved.files ?? []) {
        const seen = byPath.get(file.path) ?? new Set<string>();
        seen.add(file.content);
        byPath.set(file.path, seen);
      }
    }
    for (const [path, contents] of byPath) {
      expect(contents.size, `${path} is written with ${String(contents.size)} different bodies`).toBe(1);
    }
  });
});
