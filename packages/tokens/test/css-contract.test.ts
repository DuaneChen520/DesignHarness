/**
 * TOKEN-API.md §3 is the interop contract between `tokens`, `primitives`, `ui` and
 * `showcase`. This suite asserts the complete frozen list — not a sample — against
 * both the freshly compiled tree and the checked-in one, plus the cascade shape the
 * contract promises.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  ALLOWED_EXTRAS,
  CASCADE_RULES,
  CONTRACT_NAMES,
  MODE_STYLESHEETS,
  SEMANTIC_COLOR_ROLES,
} from './helpers/contract.js';
import { declarations, publicNamesInRule, publicTokenNames } from './helpers/css.js';
import { GENERATED_TARGETS, freshBuildRoot, packageRoot } from './helpers/pipeline.js';

interface Tree {
  readonly label: string;
  readonly root: string;
  readonly css: Record<string, string>;
}

const TREES: Tree[] = [];

function loadTree(label: string, root: string): Tree | null {
  if (!existsSync(join(root, 'dist/css/index.css'))) return null;
  const css: Record<string, string> = {};
  for (const file of ['index.css', 'light.css', 'dark.css', 'high-contrast.css', 'high-contrast-dark.css']) {
    css[file] = readFileSync(join(root, `dist/css/${file}`), 'utf8');
  }
  return { label, root, css };
}

beforeAll(() => {
  const fresh = freshBuildRoot();
  for (const [label, root] of [['fresh', fresh], ['package', packageRoot]] as const) {
    const tree = loadTree(label, root);
    if (tree !== null) TREES.push(tree);
  }
  expect(TREES.length, 'the pipeline produced no CSS tree').toBeGreaterThan(0);
});

const asVar = (name: string): string => `--${name}`;

describe('TOKEN-API §3 custom property contract', () => {
  it('emits every contract property in light, dark and both high-contrast sheets', () => {
    for (const tree of TREES) {
      for (const { mode, file } of MODE_STYLESHEETS) {
        const css = readFileSync(join(tree.root, file), 'utf8');
        const emitted = new Set(publicTokenNames(css));
        const missing = CONTRACT_NAMES.filter((name) => !emitted.has(name));
        expect(missing, `${tree.label}/${file} is missing contract properties`).toEqual([]);
      }
    }
  });

  it('emits every contract property in the combined cascade sheet', () => {
    for (const tree of TREES) {
      const emitted = new Set(publicTokenNames(tree.css['index.css'] as string));
      const missing = CONTRACT_NAMES.filter((name) => !emitted.has(name));
      expect(missing, `${tree.label}/index.css is missing contract properties`).toEqual([]);
    }
  });

  it('redefines all 29 semantic colour roles inside every [data-theme] block', () => {
    for (const tree of TREES) {
      const css = tree.css['index.css'] as string;
      for (const { selector, mode } of CASCADE_RULES) {
        const expected = SEMANTIC_COLOR_ROLES.map((role) => `color-${role}`);
        const present = publicNamesInRule(css, selector);
        const missing = expected.filter((name) => !present.includes(name));
        expect(missing, `${tree.label}: ${selector} (mode ${mode}) must redefine every semantic colour`).toEqual([]);
        // The light block additionally carries the primitive + mode-independent tiers;
        // every other cascade block is a pure semantic recomposition.
        if (selector !== ':root, [data-theme="light"]') {
          expect(present, `${tree.label}: ${selector} must emit exactly the semantic tier`).toEqual(expected);
        }
      }
    }
  });

  it('drives the cascade with different values per mode, not the same value four times', () => {
    for (const tree of TREES) {
      const css = tree.css['index.css'] as string;
      const light = declarations(ruleSlice(css, ':root, [data-theme="light"]'));
      for (const mode of ['dark', 'high-contrast', 'high-contrast-dark'] as const) {
        const block = declarations(ruleSlice(css, `[data-theme="${mode}"]`));
        const changed = SEMANTIC_COLOR_ROLES
          .map((role) => asVar(`color-${role}`))
          .filter((name) => light.has(name) && block.has(name) && light.get(name) !== block.get(name));
        expect(changed.length, `${tree.label}: ${mode} must recompose real colour roles`).toBeGreaterThan(5);
      }
    }
  });

  it('mirrors the dark block under prefers-color-scheme', () => {
    for (const tree of TREES) {
      const css = tree.css['index.css'] as string;
      const media = ruleSlice(css, '@media (prefers-color-scheme: dark)');
      expect(media, `${tree.label}: missing prefers-color-scheme block`).not.toBe('');
      expect(media).toContain(':root:not([data-theme="light"])');
      const mediaNames = new Set(publicNamesInRule(css, ':root:not([data-theme="light"])'));
      const darkNames = new Set(publicNamesInRule(css, '[data-theme="dark"]'));
      expect(
        [...darkNames].filter((name) => !mediaNames.has(name)),
        `${tree.label}: prefers-color-scheme must mirror the dark block`,
      ).toEqual([]);
    }
  });

  it('declares color-scheme for every mode block', () => {
    for (const tree of TREES) {
      const css = tree.css['index.css'] as string;
      expect(ruleSlice(css, ':root, [data-theme="light"]')).toContain('color-scheme: light');
      expect(ruleSlice(css, '[data-theme="dark"]')).toContain('color-scheme: dark');
      expect(ruleSlice(css, '[data-theme="high-contrast"]')).toContain('color-scheme: light');
      expect(ruleSlice(css, '[data-theme="high-contrast-dark"]')).toContain('color-scheme: dark');
    }
  });

  it('never emits an unresolved value (the undefined-literal regression class)', () => {
    for (const tree of TREES) {
      for (const [file, css] of Object.entries(tree.css)) {
        expect(css, `${tree.label}/${file} contains an unresolved value`).not.toMatch(/:\s*(undefined|NaN|null)\s*;/);
      }
    }
  });

  it('emits nothing outside the contract, the primitive tier and the component colour tier', () => {
    const contract = new Set(CONTRACT_NAMES);
    for (const tree of TREES) {
      const emitted = new Set(publicTokenNames(tree.css['index.css'] as string));
      const unexpected = [...emitted].filter(
        (name) =>
          !contract.has(name)
          && !name.startsWith('color-primitive-')
          && !/^color-.+-(background|foreground)$/.test(name)
          && !ALLOWED_EXTRAS.includes(name),
      );
      expect(unexpected, `${tree.label}: undocumented public names leaked into the CSS`).toEqual([]);
    }
  });

  it('ships the flat resolved JSON with every contract name resolved', () => {
    for (const tree of TREES) {
      const flat = JSON.parse(readFileSync(join(tree.root, 'dist/json/tokens.json'), 'utf8')) as Record<string, string>;
      const missing = CONTRACT_NAMES.filter((name) => flat[name] === undefined);
      expect(missing, `${tree.label}: dist/json/tokens.json is missing keys`).toEqual([]);
      const unresolved = Object.entries(flat).filter(([, value]) => /undefined|NaN/.test(value));
      expect(unresolved, `${tree.label}: flat JSON has unresolved values`).toEqual([]);
    }
  });

  it('keeps the checked-in tree byte-identical to the freshly compiled one', () => {
    if (TREES.length < 2) return;
    const [fresh, checked] = TREES as readonly [Tree, Tree];
    for (const target of GENERATED_TARGETS) {
      const a = readFileSync(join(fresh.root, target), 'utf8');
      const b = readFileSync(join(checked.root, target), 'utf8');
      expect(b === a, `${checked.label}/${target} differs from a fresh regeneration`).toBe(true);
    }
  });
});

/** The raw text of a rule's block, brace matched. */
function ruleSlice(css: string, selector: string): string {
  const at = css.indexOf(selector);
  if (at < 0) return '';
  const open = css.indexOf('{', at + selector.length);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    else if (css[index] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, index);
    }
  }
  return '';
}
