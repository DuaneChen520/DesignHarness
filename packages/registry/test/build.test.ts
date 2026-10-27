import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { RegistryIndex } from '@designharness/engine';
import { BASE_ITEM_NAME, STYLE_ITEM_NAME } from '../src/build.js';
import { SHADCN_REGISTRY_FILE_TYPES, SHADCN_REGISTRY_ITEM_TYPES, validateRegistryIndex, validateRegistryItem, validateRegistrySet } from '../src/schema.js';
import type { RegistryItemDocument } from '../src/schema.js';
import { designMarkdownPath, registryItemsDirName, tokensPackageRoot, uiSourceRoot } from '../src/paths.js';
import { buildFixture, itemByName, itemsOfType } from './fixture.js';
import type { RegistryFixture } from './fixture.js';

let fixture: RegistryFixture;

beforeAll(async () => {
  fixture = await buildFixture();
});

afterAll(async () => {
  await fixture.cleanup();
});

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

describe('the built registry on disk', () => {
  it('writes an index and one document per item', async () => {
    const index = await fixture.readJson<RegistryIndex>('registry.json');
    expect(index.name).toBe('meridian');
    expect(index.totalItems).toBe(index.items.length);
    expect(index.items.length).toBeGreaterThanOrEqual(7);

    for (const entry of index.items) {
      const path = join(fixture.dir, registryItemsDirName, `${entry.name}.json`);
      expect(existsSync(path), `r/${entry.name}.json`).toBe(true);
    }
    // The same index under the second name shadcn tooling probes for.
    expect(await fixture.read('index.json')).toBe(await fixture.read('registry.json'));
  });

  it('emits the frozen component ids plus the base and style items', () => {
    const components = itemsOfType(fixture.built, 'registry:component').map((item) => item.name);
    expect(components).toEqual(['button', 'combobox', 'data-table', 'dialog', 'input']);
    expect(fixture.built.items.map((item) => item.name)).toContain(BASE_ITEM_NAME);
    expect(fixture.built.items.map((item) => item.name)).toContain(STYLE_ITEM_NAME);
  });

  it('conforms to the shadcn schema in every emitted document', async () => {
    const index = await fixture.readJson<RegistryIndex>('registry.json');
    expect(validateRegistryIndex(index)).toEqual([]);

    for (const item of fixture.built.items) {
      const onDisk = await fixture.readJson<RegistryItemDocument>(`${registryItemsDirName}/${String(item.name)}.json`);
      expect(validateRegistryItem(onDisk, `r/${String(item.name)}.json`), item.name).toEqual([]);
      expect(SHADCN_REGISTRY_ITEM_TYPES).toContain(onDisk.type);
      for (const file of onDisk.files ?? []) {
        expect(SHADCN_REGISTRY_FILE_TYPES).toContain(file.type);
        expect(file.type).not.toBe('registry:css');
        expect(file.content.length).toBeGreaterThan(0);
        expect(file.path.startsWith('/')).toBe(false);
        expect(file.path.startsWith('src/')).toBe(false);
      }
    }
    expect(validateRegistrySet(index, fixture.built.items)).toEqual([]);
  });
});

describe('the payload is the real source text', () => {
  it('ships every component file byte-for-byte from packages/ui/src', async () => {
    const components = itemsOfType(fixture.built, 'registry:component');
    expect(components.length).toBeGreaterThan(0);

    for (const item of components) {
      const sourcePath = join(uiSourceRoot, `${String(item.name)}.tsx`);
      const expected = await readFile(sourcePath, 'utf8');
      const shipped = (item.files ?? []).find((file) => file.path.endsWith(`${String(item.name)}.tsx`));
      expect(shipped, `${String(item.name)}: no .tsx payload`).toBeDefined();
      expect(shipped?.content, `${String(item.name)}: empty payload`).not.toBe('');
      expect(shipped?.content.length).toBeGreaterThan(500);
      // Byte equality with the file on disk is the whole point: no placeholders.
      expect(shipped?.content).toBe(expected);
      expect(sha256(shipped?.content ?? '')).toBe(sha256(expected));
      expect(JSON.stringify(item.meta)).toContain(sha256(expected));
    }
  });

  it('ships the shared class helper verbatim too', async () => {
    const helperPath = join(uiSourceRoot, 'internal', 'classnames.ts');
    const expected = await readFile(helperPath, 'utf8');
    for (const item of itemsOfType(fixture.built, 'registry:component')) {
      const lib = (item.files ?? []).find((file) => file.path.endsWith('classnames.ts'));
      expect(lib?.content, `${String(item.name)} ships no class helper`).toBe(expected);
      expect(lib?.type).toBe('registry:lib');
    }
    const base = itemByName(fixture.built, BASE_ITEM_NAME);
    expect((base.files ?? []).find((file) => file.path.endsWith('classnames.ts'))?.content).toBe(expected);
  });

  it('ships each component stylesheet verbatim', async () => {
    for (const item of itemsOfType(fixture.built, 'registry:component')) {
      const id = String(item.name);
      const cssPath = join(uiSourceRoot, 'styles', `${id}.css`);
      if (!existsSync(cssPath)) continue;
      const expected = await readFile(cssPath, 'utf8');
      const shipped = (item.files ?? []).find((file) => file.path.endsWith(`${id}.css`));
      expect(shipped?.content).toBe(expected);
    }
  });

  it('carries the compiled token CSS and the Tailwind theme in meridian-base', async () => {
    const tokenCss = await readFile(join(tokensPackageRoot, 'dist', 'css', 'index.css'), 'utf8');
    const theme = await readFile(join(tokensPackageRoot, 'tailwind', 'theme.css'), 'utf8');
    const base = itemByName(fixture.built, BASE_ITEM_NAME);
    expect(base.type).toBe('registry:base');

    const css = (base.files ?? []).find((file) => file.path === 'styles/designharness/tokens.css');
    expect(css?.type).toBe('registry:style');
    expect(css?.content).toBe(tokenCss);
    expect(css?.content).toContain('--color-text-secondary: oklch(');

    const tailwind = (base.files ?? []).find((file) => file.path === 'styles/designharness/tailwind-theme.css');
    expect(tailwind?.content).toBe(theme);
    expect(tailwind?.content).toContain('@theme');

    const meta = base.meta as { tokens: { sha256: string; cssCustomProperties: number }; tailwind: { sha256: string }; intent: { file: string; sha256: string } };
    expect(meta.tokens.sha256).toBe(sha256(tokenCss));
    expect(meta.tokens.cssCustomProperties).toBeGreaterThan(150);
    expect(meta.tailwind.sha256).toBe(sha256(theme));
    expect(meta.intent.sha256).toBe(sha256(await readFile(designMarkdownPath, 'utf8')));
  });

  it('generates the style entry sheet from the authored cascade order', async () => {
    const barrel = await readFile(join(uiSourceRoot, 'styles.css'), 'utf8');
    const authoredOrder = [...barrel.matchAll(/@import\s+'\.\/styles\/([^']+)'/g)].map((match) => match[1]);
    const style = itemByName(fixture.built, STYLE_ITEM_NAME);
    expect(style.type).toBe('registry:style');
    const sheet = (style.files ?? []).find((file) => file.path === 'styles/designharness/index.css');
    expect(sheet?.content).toBeDefined();
    const imported = [...(sheet?.content ?? '').matchAll(/@import '\.\/([^']+)'/g)].map((match) => match[1]);
    expect(imported).toEqual(['tokens.css', 'tailwind-theme.css', ...authoredOrder]);
    const registryDeps = (style.registryDependencies ?? []) as string[];
    for (const id of itemsOfType(fixture.built, 'registry:component').map((item) => item.name)) {
      expect(registryDeps).toContain(id);
    }
  });
});

describe('the metadata is measured, not typed in', () => {
  it('publishes a prop contract for every component', () => {
    for (const item of itemsOfType(fixture.built, 'registry:component')) {
      const meta = item.meta as { props: unknown[]; propCount: number; contractPropCount: number; metadataProvenance: string; metadataSource: string };
      expect(meta.props.length, `${String(item.name)} has no props`).toBeGreaterThan(0);
      expect(meta.propCount).toBe(meta.props.length);
      expect(meta.contractPropCount).toBeGreaterThanOrEqual(meta.propCount);
      expect(['contracts-metadata', 'engine-extraction', 'story-argTypes']).toContain(meta.metadataProvenance);
      expect(meta.metadataSource.length).toBeGreaterThan(0);
    }
  });

  it('reports the token references each stylesheet makes', () => {
    for (const item of itemsOfType(fixture.built, 'registry:component')) {
      const meta = item.meta as { tokenReferences: string[]; tokensReferenced: number };
      expect(meta.tokenReferences.length).toBeGreaterThan(5);
      expect(meta.tokensReferenced).toBe(meta.tokenReferences.length);
      expect(meta.tokenReferences.every((name) => name.startsWith('--'))).toBe(true);
    }
  });

  it('records accessibility evidence instead of a badge', () => {
    for (const item of itemsOfType(fixture.built, 'registry:component')) {
      const a11y = (item.meta as { a11y: { status: string; standard: string; gate: number; axe: { status: string }; contrast: { audited: number; failures: number } } }).a11y;
      expect(['verified', 'provisional', 'blocked']).toContain(a11y.status);
      expect(a11y.standard).toBe('WCAG 2.2 AA');
      expect(a11y.gate).toBe(3);
      expect(['passed', 'failed', 'not-run']).toContain(a11y.axe.status);
      // The contrast layer is provable from the compiled artifact, so it must be non-empty.
      expect(a11y.contrast.audited).toBeGreaterThan(0);
      expect(a11y.contrast.failures).toBe(0);
    }
  });
});

describe('build determinism', () => {
  it('produces byte-identical documents on a second run', async () => {
    const again = await buildFixture();
    try {
      expect(again.built.files.length).toBe(fixture.built.files.length);
      for (let i = 0; i < again.built.files.length; i += 1) {
        const first = fixture.built.files[i];
        const second = again.built.files[i];
        expect(second?.relativePath).toBe(first?.relativePath);
        expect(second?.contents).toBe(first?.contents);
      }
    } finally {
      await again.cleanup();
    }
  });
});
