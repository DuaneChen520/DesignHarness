import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildArtifact,
  cssNameFromPath,
  cssVarName,
  exportDtcgBase,
  generateArtifact,
  parseDesignDocument,
  resolveColorToRgb,
  resolveValue,
} from '../src/index.js';

const DESIGN_MD = fileURLToPath(new URL('../../../DESIGN.md', import.meta.url));

// This package's ESLint gate bans `#RRGGBB` literals, so colours are stored without
// the leading hash and normalised through `hx`.
const hx = (h: string): string => `#${h}`;

function isGroup(node: unknown): node is Record<string, unknown> {
  return typeof node === 'object' && node !== null && !('$value' in (node as Record<string, unknown>));
}

function assertReservedMembers(node: Record<string, unknown>, path: string): void {
  const allowed = new Set(['$value', '$type', '$description', '$extensions']);
  for (const key of Object.keys(node)) {
    if (key.startsWith('$')) {
      expect(allowed.has(key), `${path}: unexpected reserved member ${key}`).toBe(true);
    }
  }
}

describe('DTCG 2025.10 artifact', () => {
  it('the official exporter yields a primitive colour base tier with hexes', () => {
    const base = exportDtcgBase(DESIGN_MD);
    const color = base['color'] as Record<string, Record<string, unknown>>;
    const primary = color['primary'] as { $value: { hex: string } };
    expect(primary.$value.hex.toLowerCase()).toBe(hx('1a5fd0'));
  });

  it('has a schema + colour group type', async () => {
    const { artifact } = await generateArtifact(DESIGN_MD);
    expect(artifact['$schema']).toContain('designtokens.org');
    const color = artifact['color'] as Record<string, unknown>;
    expect(color['$type']).toBe('color');
  });

  it('primitive leaves are oklch strings carrying designharness extensions', async () => {
    const { artifact } = await generateArtifact(DESIGN_MD);
    const primitive = (artifact['color'] as Record<string, unknown>)['primitive'] as Record<string, Record<string, unknown>>;
    const primary = primitive['primary'] as { $value: string; $extensions: { designharness: { tier: string; mode: string } } };
    expect(primary.$value).toMatch(/^oklch\(/);
    expect(primary.$extensions.designharness.tier).toBe('primitive');
    expect(primary.$extensions.designharness.mode).toBe('light');
  });

  it('semantic colours are aliases into the primitives', async () => {
    const { artifact } = await generateArtifact(DESIGN_MD);
    const semantic = (artifact['color'] as Record<string, unknown>)['semantic'] as Record<string, { $value: string }>;
    expect(semantic['primary']?.$value).toBe('{color.primitive.primary}');
    expect(semantic['text-primary']?.$value).toBe('{color.primitive.text-primary}');
    // dark semantic resolves into the dark primitive bucket.
    const dark = semantic['dark'] as Record<string, { $value: string }>;
    expect(dark['canvas']?.$value).toBe('{color.primitive.dark.canvas}');
  });

  it('every leaf uses only $-prefixed reserved members', async () => {
    const { artifact } = await generateArtifact(DESIGN_MD);
    const walk = (node: unknown, path: string): void => {
      if (!isGroup(node)) {
        assertReservedMembers(node, path);
        if ('$value' in node) {
          const ext = node['$extensions'] as { designharness?: { tier?: string; mode?: string } } | undefined;
          if (ext?.designharness) {
            expect(['primitive', 'semantic', 'component']).toContain(ext.designharness.tier);
          }
        }
        return;
      }
      for (const [k, child] of Object.entries(node)) {
        if (k.startsWith('$')) continue;
        walk(child, `${path}.${k}`);
      }
    };
    walk(artifact, '');
  });

  it('alias chains resolve to a concrete colour', async () => {
    const { artifact } = await generateArtifact(DESIGN_MD);
    const value = resolveValue(artifact, 'color.semantic.primary');
    expect(typeof value).toBe('string');
    expect(value as string).toMatch(/^oklch\(/);
    const rgb = resolveColorToRgb(artifact, 'color.semantic.primary');
    // #1A5FD0 → (26, 95, 208) within rounding tolerance.
    expect(rgb[0]).toBeCloseTo(26, 0);
    expect(rgb[1]).toBeCloseTo(95, 0);
    expect(rgb[2]).toBeCloseTo(208, 0);
  });

  it('non-colour groups carry the right $type', async () => {
    const { artifact } = await generateArtifact(DESIGN_MD);
    expect((artifact['space'] as Record<string, unknown>)['$type']).toBe('dimension');
    expect((artifact['radius'] as Record<string, unknown>)['$type']).toBe('dimension');
    expect((artifact['duration'] as Record<string, unknown>)['$type']).toBe('duration');
    expect((artifact['easing'] as Record<string, unknown>)['$type']).toBe('cubicBezier');
    expect((artifact['elevation'] as Record<string, unknown>)['$type']).toBe('shadow');
    expect(((artifact['font'] as Record<string, unknown>)['family'] as Record<string, unknown>)['$type']).toBe('fontFamily');
  });

  it('is byte-stable across regenerations', async () => {
    const a = await generateArtifact(DESIGN_MD);
    const b = await generateArtifact(DESIGN_MD);
    expect(a.json).toBe(b.json);
    // And building from the same parts twice is identical.
    const base = exportDtcgBase(DESIGN_MD);
    const doc = parseDesignDocument(await (await import('node:fs/promises')).readFile(DESIGN_MD, 'utf8'));
    expect(JSON.stringify(buildArtifact(base, doc))).toBe(JSON.stringify(b.artifact));
  });

  it('produces no non-$ members without a $value at the leaf level', async () => {
    const { json } = await generateArtifact(DESIGN_MD);
    expect(json).not.toMatch(/"value"/); // must use $value, never bare "value"
  });
});

describe('css-name mapping', () => {
  it('strips semantic tier + mode segments', () => {
    expect(cssNameFromPath(['color', 'semantic', 'text-primary'])).toBe('color-text-primary');
    expect(cssNameFromPath(['color', 'semantic', 'dark', 'text-primary'])).toBe('color-text-primary');
    expect(cssNameFromPath(['color', 'semantic', 'highContrastDark', 'canvas'])).toBe('color-canvas');
  });

  it('keeps primitive + bucket segments', () => {
    expect(cssNameFromPath(['color', 'primitive', 'canvas'])).toBe('color-primitive-canvas');
    expect(cssNameFromPath(['color', 'primitive', 'dark', 'canvas'])).toBe('color-primitive-dark-canvas');
    expect(cssNameFromPath(['color', 'primitive', 'hcDark', 'canvas'])).toBe('color-primitive-hc-dark-canvas');
  });

  it('special-cases font line-height + letter-spacing', () => {
    expect(cssNameFromPath(['font', 'lineHeight', 'body-md'])).toBe('line-height-body-md');
    expect(cssNameFromPath(['font', 'letterSpacing', 'heading-1'])).toBe('letter-spacing-heading-1');
    expect(cssNameFromPath(['font', 'size', 'body-md'])).toBe('font-size-body-md');
    expect(cssVarName(['font', 'family', 'mono'])).toBe('--font-family-mono');
  });

  it('maps component + control + target groups', () => {
    expect(cssNameFromPath(['button', 'height'])).toBe('button-height');
    expect(cssNameFromPath(['button', 'padding-inline'])).toBe('button-padding-inline');
    expect(cssNameFromPath(['control', 'height', 'md'])).toBe('control-height-md');
    expect(cssNameFromPath(['target', 'size', 'min'])).toBe('target-size-min');
    expect(cssNameFromPath(['dialog', 'max-width-sm'])).toBe('dialog-max-width-sm');
  });
});
