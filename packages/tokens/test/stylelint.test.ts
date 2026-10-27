/**
 * Tier-1 sensor (RESEARCH §7.1, DESIGN.md "Don'ts"): authored CSS must consume tokens.
 *
 * The suite runs the repository's real Stylelint configuration (`stylelint.config.mjs`
 * at the repo root, loaded explicitly so the result never depends on a worker's cwd)
 * over:
 *   (a) the authored CSS of `packages/tokens` and `packages/ui/src`;
 *   (b) a deliberately non-compliant fixture, which MUST be caught — a sensor that
 *       never reports is indistinguishable from a sensor that never runs;
 *   (c) the generated token tree, which the same config exempts because those files
 *       are the tokens rather than CSS that consumes them.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { packageRoot, repoRoot } from './helpers/pipeline.js';

interface StylelintWarning {
  readonly rule: string;
  readonly text: string;
  readonly line: number;
}

interface StylelintResult {
  readonly source: string;
  readonly warnings: StylelintWarning[];
}

interface LintOptions {
  readonly files: readonly string[];
}

type LintFn = (options: LintOptions & { configFile: string; configBasedir: string }) => Promise<{
  results: StylelintResult[];
  errored: boolean;
}>;

const HARNESS_RULES = [
  'harness/no-hardcoded-color',
  'harness/no-hardcoded-length',
  'harness/no-important',
  'harness/prefer-token-reference',
] as const;

const REPO_CONFIG = join(repoRoot, 'stylelint.config.mjs');

/** Segments that hold generated output rather than authored CSS. */
const GENERATED_SEGMENTS = ['node_modules', 'dist', 'tailwind', 'coverage', '.turbo'];

function authoredCss(directory: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return out; // the directory does not exist yet (a package still under construction)
  }
  for (const entry of entries) {
    const absolute = join(directory, entry);
    if (GENERATED_SEGMENTS.includes(entry)) continue;
    const kind = statSync(absolute);
    if (kind.isDirectory()) out.push(...authoredCss(absolute));
    else if (entry.endsWith('.css')) out.push(absolute);
  }
  return out;
}

let lint: LintFn;

beforeAll(async () => {
  const stylelintModule = (await import('stylelint')) as unknown as { default: { lint: LintFn } };
  lint = stylelintModule.default.lint.bind(stylelintModule.default);
});

/** Lint with the repo config, resolved from the repo root. */
function lintWithRepoConfig(files: readonly string[]) {
  return lint({ files, configFile: REPO_CONFIG, configBasedir: repoRoot });
}

describe('Tier-1 stylelint sensor', () => {
  it('finds no hardcoded colours, pixels or !important in authored CSS', async () => {
    const badFixture = join(packageRoot, 'test', 'fixtures', 'authored-bad.css');
    const targets = [
      ...authoredCss(join(packageRoot, 'test', 'fixtures')).filter((file) => file !== badFixture),
      ...authoredCss(join(packageRoot, 'src')),
      ...authoredCss(join(repoRoot, 'packages', 'ui', 'src')),
    ];
    expect(targets.length, 'no authored CSS was discovered to lint').toBeGreaterThan(0);
    const report = await lintWithRepoConfig(targets);
    const problems = report.results
      .filter((result) => result.warnings.length > 0)
      .map((result) => `${result.source}: ${result.warnings.map((w) => `${String(w.line)} ${w.rule} ${w.text}`).join(' | ')}`);
    expect(problems, 'authored CSS must consume tokens (TOKEN-API §5)').toEqual([]);
    expect(report.errored).toBe(false);
  });

  it('catches the deliberately non-compliant fixture, rule by rule', async () => {
    const report = await lintWithRepoConfig([join(packageRoot, 'test', 'fixtures', 'authored-bad.css')]);
    expect(report.results).toHaveLength(1);
    const fired = report.results[0]?.warnings.map((warning) => warning.rule) ?? [];
    for (const rule of HARNESS_RULES) {
      expect(fired, `the sensor never reported ${rule}`).toContain(rule);
    }
    expect(report.errored, 'the bad fixture must fail the gate').toBe(true);
    // Each rule must fire more than once: the fixture repeats the pattern, and a rule
    // that only matched by accident is not a sensor.
    for (const rule of HARNESS_RULES) {
      expect(fired.filter((name) => name === rule).length, `${rule} fired only once`).toBeGreaterThan(1);
    }
  });

  it('exempts the generated token tree, which is the tokens themselves', async () => {
    const generated = [join(packageRoot, 'dist/css/index.css'), join(packageRoot, 'tailwind/theme.css')];
    const report = await lintWithRepoConfig(generated);
    expect(report.results.flatMap((result) => result.warnings), 'generated token CSS must stay exempt').toEqual([]);
    expect(report.errored).toBe(false);
  });
});
