import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateArtifact, runStyleDictionary } from '../src/index.js';

const DESIGN_MD = fileURLToPath(new URL('../../../DESIGN.md', import.meta.url));

let dir: string;
let indexCss = '';
let darkCss = '';
let tailwindCss = '';
let recipeJs = '';

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'engine-sd-'));
  const { artifact } = await generateArtifact(DESIGN_MD);
  await runStyleDictionary(artifact, { tokensDir: dir });
  indexCss = await readFile(join(dir, 'dist/css/index.css'), 'utf8');
  darkCss = await readFile(join(dir, 'dist/css/dark.css'), 'utf8');
  tailwindCss = await readFile(join(dir, 'tailwind/theme.css'), 'utf8');
  recipeJs = await readFile(join(dir, 'dist/recipe/index.js'), 'utf8');
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('Style Dictionary output', () => {
  it('writes the :root / [data-theme] / prefers-color-scheme cascade', () => {
    expect(indexCss).toContain(':root, [data-theme="light"]');
    expect(indexCss).toContain('[data-theme="dark"]');
    expect(indexCss).toContain('[data-theme="high-contrast"]');
    expect(indexCss).toContain('[data-theme="high-contrast-dark"]');
    expect(indexCss).toContain('@media (prefers-color-scheme: dark)');
    expect(indexCss).toContain('color-scheme: dark');
  });

  it('strips the semantic/mode segments so dark re-declares the same public names', () => {
    expect(darkCss).toContain('--color-canvas:');
    expect(darkCss).toContain('--color-text-primary:');
    expect(darkCss).toContain('oklch(');
    // primitive names remain namespaced under color-primitive-*
    expect(indexCss).toContain('--color-primitive-dark-canvas:');
  });

  it('emits the §3 component + control + target custom properties', () => {
    for (const name of [
      '--space-md',
      '--radius-md',
      '--font-size-body-md',
      '--line-height-body-md',
      '--letter-spacing-heading-1',
      '--duration-fast',
      '--easing-standard',
      '--elevation-1',
      '--control-height-md',
      '--target-size-min',
      '--button-height',
      '--dialog-max-width-sm',
      '--table-row-height-compact',
    ]) {
      expect(indexCss).toContain(`${name}:`);
    }
  });

  it('maps Tailwind namespaces in @theme', () => {
    expect(tailwindCss).toContain('@theme {');
    expect(tailwindCss).toContain('--color-primary:');
    expect(tailwindCss).toContain('--spacing-md:');
    expect(tailwindCss).toContain('--radius-md:');
    expect(tailwindCss).toContain('--text-body-md:');
    expect(tailwindCss).toContain('--font-weight-body-md:');
    expect(tailwindCss).toContain('--font-mono:');
    expect(tailwindCss).toContain('--shadow-elevation-1:');
    expect(tailwindCss).toContain('--default-transition-duration:');
    expect(tailwindCss).toContain('--ease-standard:');
    expect(tailwindCss).toContain('cubic-bezier(');
  });

  it('emits a JS recipe with tokens + modes + semanticRoles', () => {
    expect(recipeJs).toContain('export const tokens =');
    expect(recipeJs).toContain('export const modes =');
    expect(recipeJs).toContain('export const semanticRoles =');
    expect(recipeJs).toContain('"color-text-primary"');
  });
});
