/**
 * Tier isolation (RESEARCH §3.3): primitives carry values, semantic and component
 * tiers carry aliases. Business code may not reach across a tier, and the artifact may
 * not smuggle a literal past a role that already has an alias.
 *
 * The assertions walk the DTCG artifact itself, so a value can never be "asserted"
 * against a copy of itself — every non-alias value is checked back to DESIGN.md, the
 * Intent SSOT.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { flattenRaw, getNodeAtPath, parseDesignDocument, resolveValue } from '@designharness/engine';

import { CONTRACT_NAMES } from './helpers/contract.js';
import { designMdPath, freshBuildRoot, packageRoot, readGenerated } from './helpers/pipeline.js';

interface DtcgNode {
  readonly $value?: unknown;
  readonly $type?: unknown;
  readonly $description?: unknown;
  readonly $extensions?: { readonly designharness?: { readonly tier?: string; readonly mode?: string } };
  readonly [key: string]: unknown;
}

const ALIAS = /^\{[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*\}$/;
const COLOUR_LITERAL = /#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b|\brgba?\(|\bhsla?\(|\bcolor-mix\(/i;

/**
 * Component-tier tokens DESIGN.md authors as literal numbers. They have an alias
 * available (the same number exists in the system tier) and are tolerated only because
 * the intent file states them as component sizes; the list is a ratchet — any *new*
 * duplicate fails this test.
 */
const DOCUMENTED_COMPONENT_LITERALS: readonly string[] = [
  'button.height',
  'button.padding-inline',
  'input.height',
  'input.padding-inline',
  'dialog.padding',
  'table.header-height',
  'table.cell-padding-inline',
  'table.row-height-compact',
  'table.row-height-standard',
];

const RESERVED = new Set(['$value', '$type', '$description', '$extensions', '$schema']);

let artifact: DtcgNode;
let leaves: Map<string, unknown>;
let document: ReturnType<typeof parseDesignDocument>;

beforeAll(() => {
  const root = freshBuildRoot();
  artifact = JSON.parse(readGenerated(root, 'tokens.json')) as DtcgNode;
  leaves = flattenRaw(artifact);
  document = parseDesignDocument(readFileSync(designMdPath, 'utf8'));
});

/** Tier recorded by the engine in `$extensions.designharness`. */
function tierOf(path: string): string | undefined {
  const node = getNodeAtPath(artifact, path) as DtcgNode | undefined;
  return node?.$extensions?.designharness?.tier;
}

describe('DTCG structural legality', () => {
  it('uses only $-prefixed reserved members', () => {
    const offenders: string[] = [];
    const walk = (node: unknown, path: readonly string[]): void => {
      if (typeof node !== 'object' || node === null) return;
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        if (key.startsWith('$') && !RESERVED.has(key)) offenders.push([...path, key].join('.'));
        walk(child, [...path, key]);
      }
    };
    walk(artifact, []);
    expect(offenders).toEqual([]);
  });

  it('tags every leaf token with a tier and a mode', () => {
    const missing: string[] = [];
    for (const path of leaves.keys()) {
      const node = getNodeAtPath(artifact, path) as DtcgNode | undefined;
      const extension = node?.$extensions?.designharness;
      if (extension?.tier === undefined || extension.mode === undefined) missing.push(path);
    }
    expect(missing).toEqual([]);
  });

  it('declares the schema and the composite $types the artifact promises', () => {
    expect(artifact['$schema']).toBe('https://www.designtokens.org/schemas/2025.10/format.json');
    for (const [group, type] of [
      ['space', 'dimension'],
      ['radius', 'dimension'],
      ['duration', 'duration'],
      ['easing', 'cubicBezier'],
      ['elevation', 'shadow'],
      ['border.width', 'dimension'],
      ['font.family', 'fontFamily'],
      ['font.size', 'dimension'],
      ['font.weight', 'number'],
      ['font.lineHeight', 'number'],
      ['font.letterSpacing', 'dimension'],
      ['control.height', 'dimension'],
      ['target.size', 'dimension'],
    ] as const) {
      const node = getNodeAtPath(artifact, group) as DtcgNode | undefined;
      expect(node?.$type, `${group} must be typed ${type}`).toBe(type);
    }
  });
});

describe('tier isolation', () => {
  it('never lets the semantic tier hold a literal colour', () => {
    const offenders: string[] = [];
    for (const [path, value] of leaves) {
      if (!path.startsWith('color.semantic.')) continue;
      if (typeof value !== 'string' || !ALIAS.test(value)) offenders.push(`${path} = ${String(value)}`);
    }
    expect(offenders, 'semantic colour tokens must be aliases into the primitive tier').toEqual([]);
    // 29 frozen roles × 4 modes, all aliases.
    expect([...leaves.keys()].filter((path) => path.startsWith('color.semantic.')).length).toBe(29 * 4);
  });

  it('aliases every semantic role into an existing primitive in all four modes', () => {
    const broken: string[] = [];
    for (const [path, value] of leaves) {
      if (!path.startsWith('color.semantic.')) continue;
      if (typeof value !== 'string' || !value.startsWith('{color.primitive.')) {
        broken.push(`${path} → ${String(value)}`);
        continue;
      }
      expect(() => resolveValue(artifact, path)).not.toThrow();
      const resolved = resolveValue(artifact, path);
      expect(typeof resolved === 'string' && (resolved as string).startsWith('oklch('), `${path} did not resolve to OKLCH`).toBe(true);
    }
    expect(broken).toEqual([]);
  });

  it('keeps the component colour tier one alias deep from the semantic tier', () => {
    const offenders: string[] = [];
    for (const [path, value] of leaves) {
      if (!path.startsWith('color.component.')) continue;
      if (typeof value !== 'string' || !value.startsWith('{color.semantic.')) offenders.push(`${path} → ${String(value)}`);
    }
    expect(offenders, 'component colour tokens must alias semantic roles, never primitives or literals').toEqual([]);
  });

  it('keeps primitives literal (no upward references) and colour-free of hex', () => {
    const aliased: string[] = [];
    const hexy: string[] = [];
    for (const [path, value] of leaves) {
      if (!path.startsWith('color.primitive.')) continue;
      if (typeof value === 'string' && value.startsWith('{')) aliased.push(path);
      if (typeof value === 'string' && COLOUR_LITERAL.test(value)) hexy.push(`${path} = ${value}`);
    }
    expect(aliased, 'a primitive must not alias a higher tier').toEqual([]);
    expect(hexy, 'primitives must be OKLCH, not hex/rgb').toEqual([]);
  });

  it('exposes every §3 contract name in the light CSS of a single-mode sheet', () => {
    // The tier test doubles as a guard that the public name set did not shrink.
    const light = readGenerated(freshBuildRoot(), 'dist/css/light.css');
    const missing = CONTRACT_NAMES.filter((name) => !light.includes(`--${name}:`));
    expect(missing).toEqual([]);
  });

  it('does not introduce new component literals where an alias already exists', () => {
    const byValue = new Map<string, string>();
    for (const [path, value] of leaves) {
      if (path.startsWith('color.') || typeof value !== 'string') continue;
      if (tierOf(path) === 'semantic' && !byValue.has(value)) byValue.set(value, path);
    }
    const duplicates: string[] = [];
    for (const [path, value] of leaves) {
      if (tierOf(path) !== 'component' || typeof value !== 'string' || value.startsWith('{')) continue;
      const source = byValue.get(value);
      if (source !== undefined) duplicates.push(`${path} = ${value} (alias available: {${source}})`);
    }
    const undocumented = duplicates
      .map((entry) => entry.split(' ')[0] as string)
      .filter((name) => !DOCUMENTED_COMPONENT_LITERALS.includes(name));
    expect(undocumented, `component tokens duplicating a semantic value instead of aliasing it: ${undocumented.join(', ')}`).toEqual([]);
    // The documented debt must stay exactly documented: no phantom entries either.
    const stillDuplicates = duplicates.map((entry) => entry.split(' ')[0] as string);
    expect(DOCUMENTED_COMPONENT_LITERALS.filter((name) => !stillDuplicates.includes(name))).toEqual([]);
  });
});

describe('no fabricated values', () => {
  it('carries every DESIGN.md colour into the primitive tier, exactly once', () => {
    const authored = Object.keys(document.frontmatter.colors).sort();
    // `$description` is written as `Primitive <bucket> colour <design-name>`, which is
    // the only place the artifact records the intent-file name it came from.
    const carried = [...leaves.keys()]
      .filter((path) => path.startsWith('color.primitive.'))
      .map((path) => {
        const node = getNodeAtPath(artifact, path) as DtcgNode | undefined;
        const match = /\scolour\s(\S+)$/.exec(String(node?.$description ?? ''));
        return match?.[1] ?? '';
      })
      .sort();
    expect(carried.length, 'primitive count must equal the DESIGN.md colour count').toBe(authored.length);
    expect(carried).toEqual(authored);
  });

  it('mirrors the DESIGN.md spacing and radius scales verbatim', () => {
    for (const [name, value] of Object.entries(document.frontmatter.spacing)) {
      expect(getNodeAtPath(artifact, `space.${name}`), `space.${name}`).toMatchObject({ $value: String(value) });
    }
    for (const [name, value] of Object.entries(document.frontmatter.rounded)) {
      expect(getNodeAtPath(artifact, `radius.${name}`), `radius.${name}`).toMatchObject({ $value: String(value) });
    }
  });

  it('mirrors the DESIGN.md type ramp verbatim', () => {
    for (const [name, style] of Object.entries(document.frontmatter.typography)) {
      if (typeof style['fontSize'] === 'string') {
        expect(getNodeAtPath(artifact, `font.size.${name}`), `font.size.${name}`).toMatchObject({ $value: style['fontSize'] });
      }
      if (style['fontWeight'] !== undefined) {
        expect(getNodeAtPath(artifact, `font.weight.${name}`), `font.weight.${name}`).toMatchObject({ $value: Number(style['fontWeight']) });
      }
      if (style['lineHeight'] !== undefined) {
        expect(getNodeAtPath(artifact, `font.lineHeight.${name}`), `font.lineHeight.${name}`).toMatchObject({ $value: Number(style['lineHeight']) });
      }
      if (typeof style['letterSpacing'] === 'string') {
        expect(getNodeAtPath(artifact, `font.letterSpacing.${name}`), `font.letterSpacing.${name}`).toMatchObject({ $value: style['letterSpacing'] });
      }
    }
  });

  it('takes every component dimension from the components block of DESIGN.md', () => {
    const components = document.frontmatter.components;
    const height = components['button-primary']?.['height'];
    expect(getNodeAtPath(artifact, 'button.height'), 'button height').toMatchObject({ $value: String(height) });
    expect(getNodeAtPath(artifact, 'input.height'), 'input height').toMatchObject({ $value: String(components['input']?.['height']) });
    expect(getNodeAtPath(artifact, 'table.header-height'), 'table header height').toMatchObject({ $value: String(components['table-header']?.['height']) });
    expect(getNodeAtPath(artifact, 'dialog.padding'), 'dialog padding').toMatchObject({ $value: String(components['dialog']?.['padding']) });
  });

  it('keeps the checked-in artifact byte-identical to the regenerated one', () => {
    const checkedIn = readFileSync(join(packageRoot, 'tokens.json'), 'utf8');
    expect(checkedIn).toBe(readGenerated(freshBuildRoot(), 'tokens.json'));
  });
});
