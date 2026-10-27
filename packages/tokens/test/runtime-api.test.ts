/**
 * The runtime API of `@designharness/tokens` is a projection of the compiled artifact.
 * These tests pin that projection to the artifact and to the CSS, so the JS side and
 * the CSS side can never drift apart from the single source of truth.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { getNodeAtPath, resolveValue } from '@designharness/engine';

import {
  baseList,
  contrastAudit,
  contrastExcludedPairs,
  contrastPairs,
  cssVarName,
  cssVarReference,
  getToken,
  isMode,
  modeList,
  primitiveList,
  semanticRoleByMode,
  semanticRoleList,
  tierOf,
  tokenNameList,
  tokenNamesForTier,
} from '../src/index.js';
import { CONTRACT_NAMES, MODE_STYLESHEETS, SEMANTIC_COLOR_ROLES } from './helpers/contract.js';
import { declarations } from './helpers/css.js';
import { freshBuildRoot, packageRoot, readGenerated } from './helpers/pipeline.js';

const MODES = ['light', 'dark', 'high-contrast', 'high-contrast-dark'] as const;

let artifact: unknown;

beforeAll(() => {
  artifact = JSON.parse(readGenerated(freshBuildRoot(), 'tokens.json'));
});

describe('token name lists', () => {
  it('exposes the frozen §3 list and nothing undocumented', () => {
    const names = new Set<string>(tokenNameList);
    const missing = CONTRACT_NAMES.filter((name) => !names.has(name));
    expect(missing, 'the runtime API lost contract names').toEqual([]);
    const unexpected = [...names].filter(
      (name) =>
        !CONTRACT_NAMES.includes(name)
        && !name.startsWith('color-primitive-')
        && !/^color-.+-(background|foreground)$/.test(name)
        && name !== 'input-radius',
    );
    expect(unexpected).toEqual([]);
  });

  it('keeps the tier lists disjoint and complete', () => {
    const tiers = ['primitive', 'semantic', 'component', 'system'] as const;
    const union = tiers.flatMap((tier) => [...tokenNamesForTier(tier)]);
    expect(union.length).toBe(tokenNameList.length);
    expect(new Set(union).size).toBe(union.length);
    expect(primitiveList.length).toBe(51);
    expect(semanticRoleList.length).toBe(29);
    expect(baseList.length).toBeGreaterThan(100);
    for (const name of union) expect(tierOf(name)).toBeDefined();
    expect(tierOf('not-a-token')).toBeUndefined();
  });

  it('agrees with the modes of the cascade', () => {
    expect(modeList).toEqual(MODES);
    expect(MODE_STYLESHEETS).toHaveLength(4);
    expect(isMode('dark')).toBe(true);
    expect(isMode('neon')).toBe(false);
  });
});

describe('getToken()', () => {
  it('resolves every semantic role in every mode through the artifact', () => {
    const segment: Record<(typeof MODES)[number], string[]> = {
      light: [],
      dark: ['dark'],
      'high-contrast': ['highContrast'],
      'high-contrast-dark': ['highContrastDark'],
    };
    for (const mode of MODES) {
      for (const role of SEMANTIC_COLOR_ROLES) {
        const path = ['color', 'semantic', ...segment[mode], role].join('.');
        const fromArtifact = resolveValue(artifact, path);
        expect(getToken(`color-${role}`, mode), `${path} in ${mode}`).toBe(fromArtifact);
      }
    }
  });

  it('matches the compiled CSS apart from the two documented platform serialisations', () => {
    // Style Dictionary renders the same DTCG value through a different transform group
    // per target: CSS quotes multi-word font families and writes durations in seconds,
    // the JS/recipe target keeps the authored `150ms` and the unquoted family. Those two
    // normalisations are asserted separately below; everything else must match exactly.
    const cssOnlyNormalisations: Readonly<Record<string, string>> = {
      'font-family-body': 'Inter',
      'font-family-display': 'Inter',
      'font-family-mono': 'JetBrains Mono',
      'duration-instant': '0ms',
      'duration-fast': '150ms',
      'duration-moderate': '250ms',
      'duration-slow': '400ms',
    };
    for (const { mode, file } of MODE_STYLESHEETS) {
      const css = declarations(readFileSync(join(freshBuildRoot(), file), 'utf8'));
      for (const [name, rawValue] of css) {
        const publicName = name.slice(2);
        const value = rawValue.replace(/^'|'$/g, '').replace(/(\d+(?:\.\d+)?)s$/, (_m, seconds: string) => `${String(Math.round(Number(seconds) * 1000))}ms`);
        const fromApi = getToken(publicName, mode as (typeof MODES)[number]);
        if (cssOnlyNormalisations[publicName] === undefined) {
          expect(fromApi, `${publicName} in ${mode}`).toBe(value);
        } else {
          expect(fromApi, `${publicName} in ${mode}`).toBeDefined();
        }
      }
    }
    expect(getToken('duration-fast')).toBe('150ms');
    expect(getToken('font-family-mono')).toBe('JetBrains Mono');
    expect(declarations(readFileSync(join(freshBuildRoot(), 'dist/css/light.css'), 'utf8')).get('--font-family-mono')).toBe("'JetBrains Mono'");
    expect(declarations(readFileSync(join(freshBuildRoot(), 'dist/css/light.css'), 'utf8')).get('--duration-fast')).toBe('0.15s');
  });

  it('is mode-independent for non-colour tokens and tolerant of the -- prefix', () => {
    for (const mode of MODES) {
      expect(getToken('space-md', mode)).toBe('16px');
      expect(getToken('radius-full', mode)).toBe('9999px');
      expect(getToken('target-size-min', mode)).toBe('24px');
    }
    expect(getToken('--color-primary')).toBe(getToken('color-primary'));
    expect(getToken('color-ghost')).toBeUndefined();
    // An unvalidated mode falls back to the light resolution instead of throwing.
    expect(getToken('color-primary', 'nonsense' as never)).toBe(getToken('color-primary'));
  });

  it('exposes the var helpers consumers need to write token-only CSS', () => {
    expect(cssVarName('color-focus')).toBe('--color-focus');
    expect(cssVarName('--color-focus')).toBe('--color-focus');
    expect(cssVarReference('color-focus')).toBe('var(--color-focus)');
    expect(semanticRoleByMode('dark')['color-canvas']).toBe(getToken('color-canvas', 'dark'));
  });

  it('reads the component and control dimensions DESIGN.md authored', () => {
    expect(getToken('button-height')).toBe('36px');
    expect(getToken('input-height')).toBe('36px');
    expect(getToken('dialog-radius')).toBe('12px');
    expect(getToken('table-row-height-comfortable')).toBe('56px');
    expect(getToken('duration-fast')).toBe('150ms');
    expect(getToken('easing-standard')).toBe('cubic-bezier(0.2, 0, 0, 1)');
    expect(getToken('elevation-0')).toBe('none');
    const component = getNodeAtPath(artifact, 'color.component.button-primary.background');
    expect(component).toMatchObject({ $value: '{color.semantic.primary}' });
  });
});

describe('contrastPairs()', () => {
  it('reports the build-time WCAG gate through the runtime API', () => {
    expect(contrastAudit.passed).toBe(true);
    expect(contrastAudit.failures).toBe(0);
    expect(contrastPairs()).toHaveLength(contrastAudit.audited);
    expect(contrastPairs({ onlyFailing: true })).toEqual([]);
    const dark = contrastPairs({ mode: 'dark' });
    expect(dark.length).toBeGreaterThan(20);
    expect(dark.every((record) => record.mode === 'dark')).toBe(true);
    const ui = contrastPairs({ kind: 'ui' });
    expect(ui.length).toBeGreaterThan(0);
    expect(ui.every((record) => record.ratio !== null && record.ratio >= 3)).toBe(true);
  });

  it('measures APCA for the same pairs without letting it gate anything', () => {
    const records = contrastPairs();
    expect(records.every((record) => typeof record.ratio === 'number')).toBe(true);
    expect(records.every((record) => typeof record.lc === 'number')).toBe(true);
    const advisory = records.filter((record) => Math.abs((record.lc as number) ?? 0) < 60);
    expect(advisory.length, 'expected low-Lc diagnostics to exist').toBeGreaterThan(0);
    expect(contrastAudit.apcaAdvisories).toBe(advisory.length);
    expect(advisory.every((record) => record.pass)).toBe(true);
  });

  it('lists the pairs a mode cannot source, without failing on them', () => {
    const excluded = contrastExcludedPairs();
    expect(excluded.length).toBeGreaterThan(0);
    for (const entry of excluded) {
      expect(entry.reason).toBe('mixed-provenance');
      expect(MODES).toContain(entry.mode);
    }
  });

  it('stays identical between the checked-in tree and the fresh compile', () => {
    expect(readFileSync(join(packageRoot, 'tokens.json'), 'utf8')).toBe(readGenerated(freshBuildRoot(), 'tokens.json'));
  });
});
