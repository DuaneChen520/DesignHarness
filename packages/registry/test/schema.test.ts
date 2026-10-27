/**
 * The validator has to reject things, or it is decoration. Every case below is a document
 * a build could plausibly emit and a shadcn client would choke on.
 */
import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertRegistryDocuments, validateRegistryIndex, validateRegistryItem, validateRegistrySet } from '../src/schema.js';
import type { RegistryItemDocument } from '../src/schema.js';
import { buildRegistry } from '../src/build.js';
import type { RegistryIndex } from '@designharness/engine';

const good: RegistryItemDocument = {
  name: 'button',
  type: 'registry:component',
  files: [{ path: 'components/designharness/button.tsx', type: 'registry:component', content: 'export const Button = 1;\n' }],
};

const goodIndex = { name: 'meridian', items: [{ name: 'button', type: 'registry:component' }], totalItems: 1 };

describe('validateRegistryItem', () => {
  it('accepts a conforming item', () => {
    expect(validateRegistryItem(good)).toEqual([]);
  });

  it('rejects a missing name, a bad type and an empty payload', () => {
    const issues = validateRegistryItem({ name: '', type: 'registry:widget', files: [{ path: 'a.tsx', type: 'registry:component', content: '   ' }] });
    const locations = issues.map((issue) => issue.location);
    expect(locations).toContain('item.name');
    expect(locations).toContain('item.type');
    expect(locations).toContain('item.files[0].content');
  });

  it('rejects the engine builder key instead of shipping it', () => {
    const asEngineEmits = { name: 'button', type: 'registry:component', files: [{ path: 'a.tsx', type: 'registry:component', contents: 'x' }] };
    const issues = validateRegistryItem(asEngineEmits);
    expect(issues.some((issue) => issue.location === 'item.files[0].content' && issue.message.includes('contents'))).toBe(true);
  });

  it('rejects absolute, traversing and src/-prefixed destinations', () => {
    const issues = validateRegistryItem({
      name: 'button',
      type: 'registry:component',
      files: [
        { path: '/etc/passwd', type: 'registry:file', content: 'x' },
        { path: '../escape.tsx', type: 'registry:component', content: 'x' },
        { path: 'src/components/button.tsx', type: 'registry:component', content: 'x' },
      ],
    });
    expect(issues.filter((issue) => issue.location.endsWith('.path'))).toHaveLength(3);
  });

  it('rejects unknown keys and a remote registry dependency', () => {
    const issues = validateRegistryItem({ ...good, bogus: 1, registryDependencies: ['https://other.example/r/x.json'] });
    expect(issues.some((issue) => issue.location === 'item.bogus')).toBe(true);
    expect(issues.some((issue) => issue.message.includes('remote URLs'))).toBe(true);
  });

  it('rejects an item with no files', () => {
    expect(validateRegistryItem({ name: 'button', type: 'registry:component' }).map((issue) => issue.location)).toContain('item.files');
  });

  it('does not accept registry:css, which is not in the schema', () => {
    const issues = validateRegistryItem({ ...good, files: [{ path: 'a.css', type: 'registry:css', content: 'x' }] });
    expect(issues.some((issue) => issue.message.includes('registry:css'))).toBe(true);
  });
});

describe('validateRegistryIndex', () => {
  it('accepts the built index shape', () => {
    expect(validateRegistryIndex(goodIndex)).toEqual([]);
  });

  it('catches a totalItems that disagrees with the list', () => {
    const issues = validateRegistryIndex({ name: 'meridian', items: goodIndex.items, totalItems: 7 });
    expect(issues.some((issue) => issue.location === 'registry.json.totalItems')).toBe(true);
  });

  it('catches duplicate names and a missing items array', () => {
    expect(validateRegistryIndex({ items: [{ name: 'button', type: 'registry:component' }, { name: 'button', type: 'registry:component' }], totalItems: 2 }).map((issue) => issue.location)).toContain('registry.json.items[1].name');
    expect(validateRegistryIndex({ items: 3, totalItems: 1 }).map((issue) => issue.location)).toContain('registry.json.items');
  });
});

describe('validateRegistrySet', () => {
  it('flags an index entry with no payload and a dependency that resolves nowhere', () => {
    const index = { name: 'x', items: [{ name: 'button', type: 'registry:component' }, { name: 'ghost', type: 'registry:component' }], totalItems: 2 } as unknown as RegistryIndex;
    const issues = validateRegistrySet(index, [{ ...good, registryDependencies: ['nowhere'] }]);
    expect(issues.some((issue) => issue.message.includes('ghost'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes('nowhere'))).toBe(true);
  });

  it('assertRegistryDocuments throws with every issue listed', () => {
    const index = { name: 'x', items: [{ name: 'button', type: 'registry:component' }], totalItems: 1 } as unknown as RegistryIndex;
    expect(() => assertRegistryDocuments(index, [{ name: 'Button', type: 'registry:mystery', files: [] } as unknown as RegistryItemDocument])).toThrowError(/shadcn schema/);
  });
});

describe('the build refuses to invent a registry', () => {
  it('fails when there are no component sources to distribute', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'designharness-empty-ui-'));
    await mkdir(join(dir, 'internal'), { recursive: true });
    await expect(buildRegistry({ uiSourceRoot: dir, outputDir: dir })).rejects.toThrowError(/no component sources/i);
  });

  it('fails when the authored stylesheet barrel is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'designharness-nobarrel-'));
    await writeFile(join(dir, 'ghost.tsx'), 'export const Ghost = () => null;\n', 'utf8');
    await expect(buildRegistry({ uiSourceRoot: dir, outputDir: dir })).rejects.toThrowError(/barrel/i);
  });
});
