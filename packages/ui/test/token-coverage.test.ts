// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FROZEN_TOKEN_NAMES, FROZEN_TOKEN_SET, isFrozenTokenName } from '../src/testing/frozen-tokens.js';

/**
 * Token coverage.
 *
 * The styled layer may only reference names from `packages/tokens/TOKEN-API.md` §3. This
 * test reads the authored CSS directly and compares every `var(--…)` it finds against the
 * frozen transcription in `src/testing/frozen-tokens.ts`, so a renamed or invented token
 * fails here — in a unit test — long before the token build lands or a visual regression
 * run could notice. It re-checks the Tier-1 sensor rules (no hex/px/`!important`) too, so
 * an unrunnable stylelint config can never silently let literals back in.
 */

const toPosix = (value: string): string => value.replace(/\\/g, '/');
const barrelPath = toPosix(fileURLToPath(new URL('../src/styles.css', import.meta.url)));
const stylesDir = toPosix(fileURLToPath(new URL('../src/styles/', import.meta.url)));

const authoredFiles: readonly string[] = [
  barrelPath,
  ...readdirSync(stylesDir)
    .filter((name) => name.endsWith('.css'))
    .sort()
    .map((name) => `${stylesDir}/${name}`),
];

const label = (file: string): string =>
  file === barrelPath ? 'src/styles.css' : file.replace(stylesDir, 'src/styles');

const sourceOf = (file: string): string => readFileSync(file, 'utf8');

/** Comments are not declarations: the sensors never read them. */
const codeOnly = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, ' ');

const VAR_PATTERN = /var\(\s*(--[A-Za-z0-9_-]+)/g;

const referencedTokens = (source: string): string[] =>
  [...source.matchAll(VAR_PATTERN)].map((match) => match[1] as string);

const allSources = authoredFiles.map((file) => ({ file, source: sourceOf(file) }));

const consumed = new Set<string>();
for (const { source } of allSources) {
  for (const name of referencedTokens(source)) consumed.add(name);
}

describe('authored CSS inventory', () => {
  it('reads the barrel and one file per component', () => {
    expect(authoredFiles.map((file) => label(file))).toEqual([
      'src/styles.css',
      'src/styles/base.css',
      'src/styles/button.css',
      'src/styles/combobox.css',
      'src/styles/data-table.css',
      'src/styles/dialog.css',
      'src/styles/input.css',
      'src/styles/motion.css',
    ]);
  });

  it('has the barrel import every authored file, in layer order', () => {
    const barrel = sourceOf(barrelPath);
    for (const { file } of allSources) {
      if (file === barrelPath) continue;
      expect(barrel).toContain(`@import './styles/${label(file).split('/').pop()}'`);
    }
    expect(barrel).toMatch(/@layer components, motion;/);
  });
});

describe('every referenced token is in the frozen §3 set', () => {
  it('resolves every var() reference', () => {
    const offenders: string[] = [];
    for (const { file, source } of allSources) {
      for (const name of referencedTokens(codeOnly(source))) {
        if (!isFrozenTokenName(name)) offenders.push(`${label(file)} → ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('consumes a meaningful slice of the frozen surface', () => {
    expect(consumed.size).toBeGreaterThan(40);
    for (const name of consumed) {
      expect(FROZEN_TOKEN_SET.has(name), `${name} is frozen`).toBe(true);
    }
    // The component tier is the reason this package exists.
    for (const name of ['--button-radius', '--dialog-padding', '--table-cell-padding-inline', '--input-height']) {
      expect(consumed.has(name), `${name} should be consumed`).toBe(true);
    }
  });

  it('declares no local custom properties of its own', () => {
    const locallyDeclared = /(^|[;{\s])--[a-zA-Z0-9-]+\s*:/m;
    for (const { file, source } of allSources) {
      expect(locallyDeclared.test(codeOnly(source)), `${label(file)} declares a custom property`).toBe(false);
    }
  });

  it('keeps the frozen list itself well formed', () => {
    expect(new Set(FROZEN_TOKEN_NAMES).size).toBe(FROZEN_TOKEN_NAMES.length);
    expect(FROZEN_TOKEN_NAMES.every((name) => name.startsWith('--'))).toBe(true);
  });
});

describe('no authored literals', () => {
  const namedColourPattern =
    /\b(?:black|white|red|green|blue|yellow|cyan|magenta|gray|grey|silver|maroon|olive|lime|aqua|teal|navy|fuchsia|purple|orange|brown|pink|gold|indigo|violet|turquoise|beige|ivory|khaki|plum|salmon|coral|crimson|scarlet|amber|azure)\b/gi;

  /**
   * Declaration values only — the same surface the sensors read. `white-space: nowrap`
   * is a property name, not a colour, and must not trip the literal scan.
   */
  const declarationValues = (source: string): string[] =>
    [...source.matchAll(/([-a-zA-Z]+)\s*:\s*([^;{}]+)/g)].map((match) => match[2] as string);

  const literalSources = (source: string): string => {
    const values = declarationValues(codeOnly(source));
    return values.map((value) => value.replace(/var\(\s*(?:[^()]|\([^()]*\))*\)/g, ' ')).join('\n');
  };

  it('contains no hex, colour function, named colour or currentColor in any value', () => {
    for (const { file, source } of allSources) {
      const values = literalSources(source);
      expect(values.match(/#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-zA-Z_-])/gi), label(file)).toBeNull();
      expect(values.match(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|device-cmyk|light-dark|color-mix|swash)\s*\(/gi), label(file)).toBeNull();
      expect(values.match(namedColourPattern), label(file)).toBeNull();
      expect(/currentcolor/i.test(values), `${label(file)} must reference a token, not currentColor`).toBe(false);
    }
  });

  it('contains no pixel length', () => {
    for (const { file, source } of allSources) {
      expect(literalSources(source).match(/(?<![\w-])[+-]?(?:\d+\.?\d*|\.?\d+)px\b/gi), label(file)).toBeNull();
    }
  });

  it('contains no !important', () => {
    for (const { file, source } of allSources) {
      expect(codeOnly(source).includes('!important'), label(file)).toBe(false);
    }
  });

  it('never reaches for an inline style escape hatch', () => {
    for (const { file, source } of allSources) {
      expect(codeOnly(source).match(/\bstyle\s*=/), label(file)).toBeNull();
    }
  });
});

describe('required styling mechanics are present', () => {
  const joined = allSources.map(({ source }) => codeOnly(source)).join('\n');

  it('wraps every authored file in a cascade layer', () => {
    for (const { file, source } of allSources) {
      if (file === barrelPath) continue;
      expect(source, label(file)).toMatch(/@layer\s+(components|motion)\s*\{/);
    }
  });

  it('draws the focus ring from --color-focus at --border-width-strong', () => {
    expect(joined).toMatch(/outline:\s*var\(--border-width-strong\)\s+solid\s+var\(--color-focus\)/);
    expect(joined).toContain(':focus-visible');
  });

  it('transitions with the motion tokens', () => {
    expect(joined).toMatch(/var\(--duration-fast\)\s+var\(--easing-standard\)/);
    expect(joined).toMatch(/transition-duration:\s*var\(--duration-instant\)/);
  });

  it('honours prefers-reduced-motion globally', () => {
    expect(joined).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(joined).toMatch(/,\s*\*::before,\s*\*::after\s*\{/);
  });

  it('declares container queries for the toolbar and the dialog layout', () => {
    expect(joined.match(/container-type:\s*inline-size/g)?.length).toBeGreaterThanOrEqual(2);
    expect(joined.match(/@container\s*\(min-width:/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('uses fluid clamp() over tokens for at least one typographic declaration', () => {
    expect(joined).toMatch(/font-size:\s*clamp\(\s*var\(--font-size-/);
  });

  it('sets numeric cells in the mono face with tabular figures', () => {
    expect(joined).toMatch(/font-family:\s*var\(--font-family-mono\)/);
    expect(joined).toContain('font-variant-numeric: tabular-nums');
    expect(joined).toContain('font-feature-settings: "tnum" 1');
  });

  it('declares the color-scheme cascade per component root', () => {
    expect(joined).toMatch(/color-scheme:\s*light dark/);
  });
});
