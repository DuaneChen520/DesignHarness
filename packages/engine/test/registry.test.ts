import { describe, expect, it } from 'vitest';
import { buildRegistryIndex, buildRegistryItem } from '../src/index.js';

describe('buildRegistryItem', () => {
  it('emits a conforming registry:component item', () => {
    const item = buildRegistryItem(
      { name: 'data-table', type: 'registry:component', title: 'DataTable', description: 'A table', meta: { tier: 'pro' } },
      [{ path: 'components/data-table.tsx' }, { path: 'hooks/use-sort.ts', type: 'registry:hook' }],
      { dependencies: ['react', 'zod', 'react'], registryDependencies: ['button'], devDependencies: ['@types/node'] },
    );
    expect(item.name).toBe('data-table');
    expect(item.type).toBe('registry:component');
    expect(item.files).toHaveLength(2);
    expect(item.files?.[0]).toEqual({ type: 'registry:component', path: 'components/data-table.tsx' });
    expect(item.files?.[1]?.type).toBe('registry:hook');
    // deps are de-duplicated + sorted
    expect(item.dependencies).toEqual(['react', 'zod']);
    expect(item.registryDependencies).toEqual(['button']);
    expect(item.meta).toEqual({ tier: 'pro' });
  });

  it('passes through file contents when supplied', () => {
    const item = buildRegistryItem({ name: 'base', type: 'registry:base' }, [{ path: 'theme.css', contents: ':root{}' }]);
    expect((item.files?.[0] as { contents?: string }).contents).toBe(':root{}');
  });

  it('omits empty collections', () => {
    const item = buildRegistryItem({ name: 'x', type: 'registry:style' }, [], { dependencies: [] });
    expect(item.dependencies).toBeUndefined();
    expect(item.files).toBeUndefined();
  });
});

describe('buildRegistryIndex', () => {
  it('builds a totalItems index with lean entries in order', () => {
    const a = buildRegistryItem({ name: 'button', type: 'registry:component', title: 'Button' }, [{ path: 'b.tsx' }]);
    const b = buildRegistryItem({ name: 'table', type: 'registry:component', description: 'T' }, [{ path: 't.tsx' }], { registryDependencies: ['button'] });
    const index = buildRegistryIndex([a, b], { name: 'meridian', homepage: 'https://example.test/r' });
    expect(index.name).toBe('meridian');
    expect(index.totalItems).toBe(2);
    expect(index.items.map((i) => i.name)).toEqual(['button', 'table']);
    expect(index.items[1]?.registryDependencies).toEqual(['button']);
    expect(index.homepage).toBe('https://example.test/r');
  });
});
