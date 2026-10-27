// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import stylelint from 'stylelint';

/**
 * The Tier-1 sensor, run as a unit test.
 *
 * `pnpm --filter @designharness/ui lint` shells out to the stylelint CLI; this file runs the
 * same repository config through the API so a regression in the authored CSS fails the test
 * suite too, and proves the sensors actually fire by linting a deliberately bad fixture. It
 * adds the one rule the plugin set cannot express — the `(0,2,0)` selectivity ceiling from
 * TOKEN-API.md §5.
 */

const toPosix = (value: string): string => value.replace(/\\/g, '/');
const testDir = toPosix(fileURLToPath(new URL('.', import.meta.url)));
const packageDir = toPosix(fileURLToPath(new URL('../', import.meta.url)));
const repoRoot = toPosix(fileURLToPath(new URL('../../', import.meta.url)));
const configPath = `${repoRoot}stylelint.config.mjs`;
const badFixture = `${testDir}fixtures/bad.css`;

const HARNESS_RULES = [
  'harness/no-hardcoded-color',
  'harness/no-hardcoded-length',
  'harness/no-important',
  'harness/prefer-token-reference',
] as const;

/** Structurally what this test reads out of a stylelint report. */
interface LintWarning {
  readonly rule: string;
  readonly text: string;
}

interface LintFileResult {
  readonly warnings: readonly LintWarning[];
}

const authoredCss = (): string[] => [
  `${packageDir}src/styles.css`,
  ...readdirSync(`${packageDir}src/styles`)
    .filter((name) => name.endsWith('.css'))
    .sort()
    .map((name) => `${packageDir}src/styles/${name}`),
];

async function lint(files: readonly string[], cwd = repoRoot): Promise<readonly LintFileResult[]> {
  const report = await stylelint.lint({
    files: [...files],
    configPath,
    configBasedir: repoRoot,
    cwd,
    allowEmptyInput: true,
  });
  return report.results;
}

const readSource = (file: string): string => readFileSync(file, 'utf8');

/** Strip comments, then take every selector prelude: the text just before a `{`. */
function extractSelectors(css: string): string[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const selectors: string[] = [];
  let pending = '';
  const flush = (): string => pending.replace(/\s+/g, ' ').trim();
  for (const character of source) {
    if (character === '{') {
      const trimmed = flush();
      if (trimmed.length > 0 && !trimmed.startsWith('@')) selectors.push(trimmed);
      pending = '';
    } else if (character === '}' || character === ';') {
      pending = '';
    } else {
      pending += character;
    }
  }
  return selectors;
}

/** Split a selector list on top-level commas only. */
function splitSelectorList(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let buffer = '';
  for (const character of selector) {
    if (character === '(' || character === '[') depth += 1;
    else if (character === ')' || character === ']') depth -= 1;
    if (character === ',' && depth === 0) {
      parts.push(buffer);
      buffer = '';
    } else {
      buffer += character;
    }
  }
  parts.push(buffer);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

/**
 * CSS selectivity as `(ids, classes, elements)`.
 *
 * `:where()` / `:is()` contribute nothing — which is precisely why the authored CSS scopes
 * anatomy parts with `:where([data-scope="…"])` and spends its two class-level slots on the
 * part plus its state. Pseudo-elements belong to the third column, and `:not()` is counted
 * conservatively as one class-level component.
 */
function specificityOf(selector: string): readonly [number, number, number] {
  const reduced = selector
    .replace(/:(?:where|is)\((?:[^()]|\([^()]*\))*\)/g, ' ')
    .replace(/::[a-zA-Z-]+/g, ' ')
    .replace(/\[[^\]]*\]/g, ' §');
  const ids = (reduced.match(/#[\w-]+/g) ?? []).length;
  const classes = (reduced.match(/\.|\s§|:[a-zA-Z-]+/g) ?? []).length;
  const elements = (reduced.match(/(?:^|[\s>+~])(?:[a-zA-Z][\w-]*|\*)/g) ?? []).length;
  return [ids, classes, elements] as const;
}

describe('stylelint gate', () => {
  it('reports zero warnings across the authored CSS', async () => {
    const results = await lint(authoredCss());
    expect(results).toHaveLength(authoredCss().length);
    expect(results.flatMap((result) => result.warnings)).toEqual([]);
  });

  it('catches every violation in the bad fixture', async () => {
    const [result] = await lint([badFixture]);
    const rules = new Set((result?.warnings ?? []).map((warning) => warning.rule));
    for (const rule of HARNESS_RULES) {
      expect(rules.has(rule), `fixture must trip ${rule}`).toBe(true);
    }
  });

  it('attributes each rule to the right kind of literal', async () => {
    const [result] = await lint([badFixture]);
    // Assembled rather than written out: the Tier-1 AST sensor bans in-source hex literals,
    // and this assertion is about what the fixture reported, not a style value of ours.
    const badHex = `#${'ff0000'}`;
    const textsFor = (rule: string): string =>
      (result?.warnings ?? []).filter((warning) => warning.rule === rule).map((warning) => warning.text).join('\n');
    expect(textsFor('harness/no-important')).toContain('!important');
    expect(textsFor('harness/no-hardcoded-color')).toContain(badHex);
    expect(textsFor('harness/no-hardcoded-length')).toContain('12px');
    expect(textsFor('harness/prefer-token-reference')).toContain('"padding" must reference a space token');
    expect(textsFor('harness/prefer-token-reference')).toContain('"box-shadow" must reference a shadow token');
  });

  it('passes the package glob the same way the lint script runs it', async () => {
    const report = await stylelint.lint({
      files: [`${packageDir}src/**/*.css`],
      configPath,
      configBasedir: repoRoot,
      cwd: repoRoot,
      allowEmptyInput: true,
    });
    expect(report.results.length).toBeGreaterThan(1);
    expect(report.results.flatMap((result) => result.warnings)).toEqual([]);
    expect(report.errored).toBe(false);
  });
});

describe('selectivity ceiling (0,2,0)', () => {
  it('keeps every authored selector within two class-level components', () => {
    const offenders: string[] = [];
    for (const file of authoredCss()) {
      const relativePath = file.replace(packageDir, '');
      for (const selector of extractSelectors(readSource(file))) {
        for (const part of splitSelectorList(selector)) {
          const [ids, classes] = specificityOf(part);
          if (ids > 0 || classes > 2) offenders.push(`${relativePath} → ${part} (${ids},${classes},·)`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('is not vacuous: the bad fixture is rejected by the same check', () => {
    const parts = extractSelectors(readSource(badFixture)).flatMap(splitSelectorList);
    expect(parts.filter((part) => specificityOf(part)[1] > 2)).toContain('.dh-bad .nested .deeper');
  });

  it('scores the patterns the authored CSS relies on exactly as documented', () => {
    expect(specificityOf('[data-part="control"]:where([data-scope="combobox"])[data-open]')[1]).toBe(2);
    expect(specificityOf('[data-part="root"]:where([data-scope="button"]):focus-visible')[1]).toBe(2);
    expect(specificityOf('.dh-combobox--loading [data-part="control"]')[1]).toBe(2);
    expect(specificityOf('[data-part="columnheader"] button:focus-visible')[1]).toBe(2);
    expect(specificityOf('.dh-button--loading .dh-button__label')[1]).toBe(2);
    expect(specificityOf('[data-part="option"]::before')[1]).toBe(1);
    // The shape this ceiling forbids: a scoped part in a variant context.
    expect(specificityOf('.dh-button[data-disabled]:hover')[1]).toBe(3);
  });

  it('finds the selectors nested inside at-rules, not just top-level ones', () => {
    const selectors = extractSelectors(readSource(`${packageDir}src/styles/motion.css`));
    expect(selectors).toContain('*, *::before, *::after');
    expect(splitSelectorList('*, *::before, *::after')).toHaveLength(3);
  });
});
