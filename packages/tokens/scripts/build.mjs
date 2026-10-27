/**
 * `@designharness/tokens` build — the one-way token pipeline.
 *
 *   DESIGN.md (Intent SSOT)
 *     └─(1) @google/design.md lint            → Tier-2 gate, errors > 0 fails the build
 *     └─(2) engine generateArtifact()         → DTCG 2025.10 artifact  → tokens.json
 *     └─(3) engine runStyleDictionary()       → dist/css, dist/json, dist/recipe, tailwind/theme.css
 *     └─(4) engine auditContrast()/auditPairs → WCAG 2.2 AA gate (APCA is advisory only)
 *     └─(5) generated runtime module          → src/generated/token-data.ts
 *     └─(6) tsc                               → dist/index.js + dist/index.d.ts
 *
 * Idempotence is a gate, not a slogan: every generated target is regenerated into a
 * throwaway directory first and compared byte-for-byte with the checked-in copy. Any
 * drift (i.e. a hand-edited `tokens.json` or `dist/`) fails the build with a diff
 * summary. Only `--write` (or `DESIGNHARNESS_TOKENS_WRITE=1`) may overwrite a drifted
 * target, which is what an intentional DESIGN.md change requires.
 *
 * Flags:
 *   --write           accept drift and rewrite the generated targets
 *   --root <dir>      package root to generate into (default: this package)
 *   --design-md <p>   DESIGN.md (Intent SSOT) to compile (default: repo root DESIGN.md)
 *   --no-compile      skip the `tsc` step (used by tests that drill the gate in a temp root)
 *   --quiet           only print warnings and errors
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { generateArtifact, lintIntent, runStyleDictionary } from '@designharness/engine';

import { APCA_ADVISORY_LC, MODES, buildContrastReport } from './contrast-matrix.mjs';

const require = createRequire(import.meta.url);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(scriptDir, '..');
const repoRoot = resolve(defaultRoot, '..', '..');

/* ------------------------------------------------------------------ *
 * cli
 * ------------------------------------------------------------------ */

function parseArgs(argv) {
  const options = {
    write: process.env.DESIGNHARNESS_TOKENS_WRITE === '1',
    root: process.env.DESIGNHARNESS_TOKENS_ROOT ? resolve(process.env.DESIGNHARNESS_TOKENS_ROOT) : defaultRoot,
    designMd: process.env.DESIGNHARNESS_DESIGN_MD ? resolve(process.env.DESIGNHARNESS_DESIGN_MD) : join(repoRoot, 'DESIGN.md'),
    compile: true,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--write' || arg === '--accept') options.write = true;
    else if (arg === '--quiet' || arg === '--silent') options.quiet = true;
    else if (arg === '--no-compile') options.compile = false;
    else if (arg === '--root') { i += 1; options.root = resolve(String(argv[i])); }
    else if (arg === '--design-md') { i += 1; options.designMd = resolve(String(argv[i])); }
    else if (arg.startsWith('--root=')) options.root = resolve(arg.slice('--root='.length));
    else if (arg.startsWith('--design-md=')) options.designMd = resolve(arg.slice('--design-md='.length));
    else throw new Error(`Unknown option for scripts/build.mjs: ${String(arg)}`);
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
let hadError = false;

function log(...args) {
  if (!options.quiet) console.log(...args);
}
function info(...args) {
  console.log('[tokens:build]', ...args);
}
function fail(message, hint) {
  hadError = true;
  console.error(`\n[tokens:build] ERROR ${message}`);
  if (hint !== undefined) console.error(`[tokens:build] ${hint}`);
  process.exitCode = 1;
}

/* ------------------------------------------------------------------ *
 * text helpers (deterministic serialisation + drift diffing)
 * ------------------------------------------------------------------ */

const sortedEntries = (obj) => Object.entries(obj).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

/** `{ "name": "value" }` as a multi-line TS/JSON-ish object literal, keys sorted. */
function tsObjectLiteral(obj, indent = '') {
  const inner = sortedEntries(obj).map(([key, value]) => `${indent}  ${JSON.stringify(key)}: ${JSON.stringify(value)}`);
  if (inner.length === 0) return '{}';
  return `{\n${inner.join(',\n')},\n${indent}}`;
}

function tsArrayLiteral(values, indent = '') {
  if (values.length === 0) return '[]';
  return `[\n${values.map((value) => `${indent}  ${JSON.stringify(value)}`).join(',\n')},\n${indent}]`;
}

/**
 * A compact, human-readable drift summary between the checked-in file and a fresh
 * regeneration. Deliberately dependency-free: the build gate must work anywhere.
 *
 * Compares the common prefix/suffix and reports the differing middle, so a pure
 * re-ordering of identical lines (which a set difference would hide) is still shown.
 */
function diffSummary(oldText, newText) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  let from = 0;
  while (from < oldLines.length && from < newLines.length && oldLines[from] === newLines[from]) from += 1;
  let toOld = oldLines.length;
  let toNew = newLines.length;
  while (toOld > from && toNew > from && oldLines[toOld - 1] === newLines[toNew - 1]) {
    toOld -= 1;
    toNew -= 1;
  }
  const removed = oldLines.slice(from, toOld);
  const added = newLines.slice(from, toNew);
  const samples = [];
  for (let i = 0; i < Math.max(removed.length, added.length) && samples.length < 8; i += 1) {
    const r = removed[i];
    const a = added[i];
    if (r !== undefined) samples.push(`- L${String(from + i + 1)}: ${r.trim().slice(0, 140)}`);
    if (a !== undefined) samples.push(`+ L${String(from + i + 1)}: ${a.trim().slice(0, 140)}`);
  }
  return { removed: removed.length, added: added.length, firstDiffLine: from + 1, samples };
}

/* ------------------------------------------------------------------ *
 * generated-source composition
 * ------------------------------------------------------------------ */

/**
 * Split the Style Dictionary recipe output into the three tiers the runtime API
 * exposes, so `src/generated/token-data.ts` carries no derived/free-standing values.
 */
function tiersFromRecipe(recipe) {
  const primitives = {};
  const semanticsLight = {};
  const base = {};
  for (const [name, value] of Object.entries(recipe.tokens)) {
    if (name.startsWith('color-primitive-')) primitives[name] = value;
    else if (recipe.semanticRoles.includes(name)) semanticsLight[name] = value;
    else base[name] = value;
  }
  const semanticByMode = {};
  for (const mode of MODES) {
    const perMode = recipe.modes[mode];
    const slice = {};
    for (const role of recipe.semanticRoles) {
      const value = perMode[role];
      if (typeof value === 'string') slice[role] = value;
    }
    semanticByMode[mode] = slice;
  }
  return { primitives, base, semanticsLight, semanticByMode };
}

/** All public CSS custom property names emitted by the pipeline (tier-stripped). */
function allTokenNames(tiers) {
  return [
    ...Object.keys(tiers.primitives),
    ...Object.keys(tiers.base),
    ...Object.keys(tiers.semanticsLight),
  ].sort();
}

/**
 * The runtime module the package's `index.ts` compiles against. Machine-generated,
 * byte-stable, and every value is a verbatim copy of the compiled artifact.
 */
function renderGeneratedModule({ tiers, names, contrast, designMdHash, designMdPath }) {
  const roleUnion = MODES.map((mode) => JSON.stringify(mode)).join(' | ');
  const lines = [
    '/**',
    ' * GENERATED by `@designharness/tokens` — DO NOT EDIT.',
    ' *',
    ' * One-way pipeline: DESIGN.md (Intent SSOT) -> DTCG 2025.10 artifact -> Style',
    ' * Dictionary v5 -> this module. Rebuild with',
    ' *   `pnpm --filter @designharness/tokens build`',
    ' * Hand edits are caught by the build\'s idempotence gate.',
    ' *',
    ` * Source: ${designMdPath}`,
    ` * Source sha256: ${designMdHash}`,
    ' */',
    '',
    '/** The four colour modes the harness compiles (TOKEN-API §3 cascade). */',
    `export type Mode = ${roleUnion};`,
    '',
    '/** Mode list in cascade order. */',
    `export const modes = ${tsArrayLiteral(MODES)} as const satisfies readonly Mode[];`,
    '',
    '/** Primitive tier: every DESIGN.md colour, OKLCH-normalised, per mode bucket. */',
    `export const primitiveValues = ${tsObjectLiteral(tiers.primitives)} as const;`,
    '',
    '/** Mode-independent tier: space, radius, type, motion, elevation, controls, components. */',
    `export const baseValues = ${tsObjectLiteral(tiers.base)} as const;`,
    '',
    '/** Semantic colour roles resolved for light mode (the public colour API). */',
    `export const semanticLightValues = ${tsObjectLiteral(tiers.semanticsLight)} as const;`,
    '',
    '/** Public CSS custom property name (no `--`) for every compiled token. */',
    `export const tokenNames = ${tsArrayLiteral(names)} as const;`,
    '',
    '/** Literal union of every public token name. */',
    'export type TokenName = (typeof tokenNames)[number];',
    '',
    '/** Semantic colour role names — the tier `ui` and `showcase` consume. */',
    `export const semanticRoles = ${tsArrayLiteral(Object.keys(tiers.semanticsLight).sort())} as const;`,
    '',
    '/** Literal union of the semantic colour roles. */',
    'export type SemanticRole = (typeof semanticRoles)[number];',
    '',
    '/** Primitive token name subset. */',
    `export const primitiveTokenNames = ${tsArrayLiteral(Object.keys(tiers.primitives).sort())} as const;`,
    '',
    '/** Mode-independent (non-colour) token name subset. */',
    `export const baseTokenNames = ${tsArrayLiteral(Object.keys(tiers.base).sort())} as const;`,
    '',
    '/** Semantic colour roles resolved per mode. */',
    `export const semanticByMode: Readonly<Record<Mode, Readonly<Record<string, string>>>> = {\n${MODES
      .map((mode) => `  ${JSON.stringify(mode)}: ${tsObjectLiteral(tiers.semanticByMode[mode], '  ')},`)
      .join('\n')}\n};`,
    '',
    '/** WCAG 2.2 measurement classes used by the contrast gate. */',
    'export type ContrastKind = "text" | "large-text" | "ui";',
    '',
    '/** One audited foreground/background pair and its measured result. */',
    'export interface ContrastRecord {',
    '  readonly id: string;',
    '  readonly mode: Mode;',
    '  /** DTCG alias chain that was measured, e.g. `color.semantic.dark.surface`. */',
    '  readonly pair: string;',
    '  readonly kind: ContrastKind;',
    '  /** WCAG 2.2 AA threshold for this measurement class. */',
    '  readonly required: number;',
    '  readonly ratio: number | null;',
    '  readonly pass: boolean;',
    '  readonly normalAA: boolean;',
    '  readonly largeAA: boolean;',
    '  readonly uiAA: boolean;',
    '  /** APCA Lc — diagnostic channel only, it can never fail the gate. */',
    '  readonly lc: number | null;',
    '  /** How the pair got its value: `artifact`, `native`, `inherited`. */',
    '  readonly provenance: string;',
    '}',
    '',
    `export const contrastRecords: readonly ContrastRecord[] = [\n${contrast.records
      .map((record) => `  ${JSON.stringify(record) },`)
      .join('\n')}\n];`,
    '',
    '/** A pair the artifact cannot source in a given mode (reported, never gated on). */',
    'export interface ContrastExclusion {',
    '  readonly mode: Mode;',
    '  readonly pair: string;',
    '  readonly kind: string;',
    '  readonly reason: string;',
    '  readonly detail: string;',
    '}',
    '',
    `export const contrastExcluded: readonly ContrastExclusion[] = [\n${contrast.excluded
      .map((entry) => `  ${JSON.stringify(entry) },`)
      .join('\n')}\n];`,
    '',
    '/** Snapshot of the WCAG 2.2 gate the artifact was built under (APCA never counted). */',
    'export const contrastGate: Readonly<{ audited: number; failures: number; apcaAdvisories: number; passed: boolean }> = '
      + `{\n  audited: ${String(contrast.records.length)},\n  failures: ${String(contrast.failures.length)},\n`
      + `  apcaAdvisories: ${String(contrast.apcaAdvisories.length)},\n  passed: ${String(contrast.failures.length === 0)},\n};`,
    '',
  ];
  return `${lines.join('\n')}\n`;
}

/* ------------------------------------------------------------------ *
 * write helpers
 * ------------------------------------------------------------------ */

/** Destinations for the Style Dictionary run, relative to the package root. */
const SD_TARGETS = [
  ['dist/css/index.css', 'dist/css/index.css'],
  ['dist/css/light.css', 'dist/css/light.css'],
  ['dist/css/dark.css', 'dist/css/dark.css'],
  ['dist/css/high-contrast.css', 'dist/css/high-contrast.css'],
  ['dist/css/high-contrast-dark.css', 'dist/css/high-contrast-dark.css'],
  ['dist/json/tokens.json', 'dist/json/tokens.json'],
  ['dist/recipe/index.js', 'dist/recipe/index.js'],
  ['dist/recipe/index.d.ts', 'dist/recipe/index.d.ts'],
  ['dist/scss/_tokens.scss', 'dist/scss/_tokens.scss'],
  ['dist/compose/Color.kt', 'dist/compose/Color.kt'],
  ['dist/swift/ColorAsset.swift', 'dist/swift/ColorAsset.swift'],
  ['tailwind/theme.css', 'tailwind/theme.css'],
];

async function readIfExists(path) {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

/** Write only when the bytes actually differ, so rebuilds never churn the tree. */
async function writeIfChanged(path, content) {
  const existing = await readIfExists(path);
  if (existing === content) return { path, status: 'unchanged' };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
  return { path, status: existing === null ? 'created' : 'rewritten' };
}

async function collectCssPropertyCounts(root) {
  const counts = {};
  for (const [relativePath] of SD_TARGETS.filter(([, to]) => to.endsWith('.css'))) {
    const text = await readIfExists(join(root, relativePath));
    if (text === null) continue;
    const names = [...text.matchAll(/--([A-Za-z0-9_-]+)\s*:/g)].map((match) => match[1]);
    counts[relativePath] = new Set(names).size;
  }
  return counts;
}

/** Resolve the package's own TypeScript compiler (same strategy as `contracts`). */
function resolveTypeScriptCli() {
  const typescriptRoot = dirname(require.resolve('typescript'));
  for (const candidate of [join(typescriptRoot, 'bin', 'tsc'), join(typescriptRoot, '..', 'bin', 'tsc')]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('typescript is installed but no bin/tsc could be found in it');
}

/* ------------------------------------------------------------------ *
 * main
 * ------------------------------------------------------------------ */

async function main() {
  const packageRoot = options.root;
  const designMdPath = options.designMd;
  if (!existsSync(designMdPath)) throw new Error(`DESIGN.md (Intent SSOT) not found at ${designMdPath}`);
  log(`[tokens:build] root      ${packageRoot}`);
  log(`[tokens:build] intent    ${designMdPath}`);

  /* (1) Tier-2 PR gate: the official DESIGN.md linter must report zero errors. */
  const lint = await lintIntent(designMdPath);
  const byRule = new Map();
  for (const finding of lint.findings) {
    const key = `${finding.severity}:${String(finding.rule ?? 'unknown')}`;
    byRule.set(key, (byRule.get(key) ?? 0) + 1);
  }
  info(`DESIGN.md lint — errors ${String(lint.errors)}, warnings ${String(lint.warnings)}`);
  for (const [rule, count] of [...byRule.entries()].sort()) {
    log(`  ${rule} × ${String(count)}`);
  }
  for (const finding of lint.findings.filter((item) => item.severity === 'error').slice(0, 20)) {
    console.error(`  error ${String(finding.path ?? '')} ${finding.message}`);
  }
  if (lint.errors > 0) {
    fail('DESIGN.md failed the @google/design.md lint (Tier-2 gate blocks the pipeline).', 'Fix the intent file; tokens are never generated from a broken contract.');
    return;
  }

  /* (2) DTCG artifact (Artifact SSOT). */
  const { artifact, json } = await generateArtifact(designMdPath);
  const designMd = await readFile(designMdPath, 'utf8');
  const designMdHash = createHash('sha256').update(designMd).digest('hex');

  /* (3) Style Dictionary compile into a throwaway dir first. */
  const tempRoot = await mkdtemp(join(tmpdir(), 'dh-tokens-build-'));
  try {
    // The throwaway root needs an ESM marker so the generated recipe module can be
    // imported here exactly as the package's own `dist/recipe` is imported (the real
    // package root carries `"type": "module"` in its package.json).
    await writeFile(join(tempRoot, 'package.json'), '{\n  "type": "module"\n}\n', 'utf8');
    await runStyleDictionary(artifact, { tokensDir: tempRoot });

    const recipeUrl = pathToFileURL(join(tempRoot, 'dist', 'recipe', 'index.js')).href;
    const recipe = await import(recipeUrl);
    if (!Array.isArray(recipe.semanticRoles) || recipe.modes === undefined) {
      throw new Error('the generated recipe module did not export tokens/modes/semanticRoles');
    }

    /* (4) WCAG 2.2 gate (APCA advisory). */
    const contrast = buildContrastReport(artifact);
    info(`contrast — ${String(contrast.records.length)} pairs audited, ${String(contrast.failures.length)} WCAG failures, ${String(contrast.apcaAdvisories.length)} APCA advisories`);
    for (const record of contrast.failures) {
      console.error(`  FAIL ${record.id} (${record.kind}, needs ${String(record.required)}:1) measured ${String(record.ratio)}:1 — ${record.pair}`);
    }
    for (const record of contrast.apcaAdvisories) {
      log(`  apca advisory ${record.id} Lc ${String(record.lc)} (WCAG ${String(record.ratio)}:1 — not a gate)`);
    }
    for (const entry of contrast.excluded) {
      log(`  skipped ${entry.mode} ${entry.pair} [${entry.reason}] ${entry.detail}`);
    }
    if (contrast.failures.length > 0) {
      fail(`WCAG 2.2 AA contrast gate failed for ${String(contrast.failures.length)} pair(s).`, 'Contrast is the only rigid gate — repair DESIGN.md, do not relax the test.');
      return;
    }

    /* (4b) APCA diagnostic channel — published for dashboards, structurally unable to gate.
       Tier 3 reads this file and prints the advisories; a missing file is not an error. */
    await mkdir(join(packageRoot, 'reports'), { recursive: true });
    await writeFile(
      join(packageRoot, 'reports', 'apca-advisories.json'),
      `${JSON.stringify(
        {
          generatedBy: '@designharness/tokens build',
          designMdHash,
          advisoryLc: APCA_ADVISORY_LC,
          auditedPairs: contrast.records.length,
          wcagFailures: contrast.failures.length,
          records: contrast.apcaAdvisories,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    /* (5) Generated runtime module. */
    const tiers = tiersFromRecipe(recipe);
    const names = allTokenNames(tiers);
    const generated = renderGeneratedModule({
      tiers,
      names,
      contrast,
      designMdHash,
      designMdPath: resolve(repoRoot, designMdPath).slice(repoRoot.length + 1).split('\\').join('/'),
    });

    /* (6) Idempotence gate: compare every generated target before touching the tree. */
    const targets = [
      { target: 'tokens.json', content: json },
      { target: 'src/generated/token-data.ts', content: generated },
      ...SD_TARGETS.map(([source, target]) => ({ target, source })),
    ];
    const drift = [];
    const pending = [];
    for (const { target, content, source } of targets) {
      const fresh = typeof content === 'string' ? content : await readIfExists(join(tempRoot, String(source)));
      if (typeof fresh !== 'string') {
        fail(`Style Dictionary did not produce ${String(source ?? target)}`, 'The compile step is missing an output the contract requires.');
        return;
      }
      const existing = await readIfExists(join(packageRoot, target));
      if (existing === null) { pending.push({ path: target, content: fresh, status: 'created' }); continue; }
      if (existing === fresh) { pending.push({ path: target, content: fresh, status: 'unchanged' }); continue; }
      drift.push({ path: target, ...diffSummary(existing, fresh) });
      pending.push({ path: target, content: fresh, status: 'rewritten' });
    }

    if (drift.length > 0 && !options.write) {
      for (const item of drift) {
        console.error(`  DRIFT ${item.path} — ${String(item.added)} line(s) added, ${String(item.removed)} line(s) removed at L${String(item.firstDiffLine)} vs a fresh regeneration`);
        for (const sample of item.samples) console.error(`      ${sample}`);
      }
      fail(
        `${String(drift.length)} generated target(s) do not match a fresh regeneration — they are machine-generated only (TOKEN-API §1).`,
        'If DESIGN.md changed on purpose, re-run with --write (or DESIGNHARNESS_TOKENS_WRITE=1); otherwise revert the hand edit.',
      );
      return;
    }

    for (const item of pending) {
      if (item.status === 'unchanged') {
        log(`  unchanged  ${item.path} (identical to a fresh regeneration — not rewritten)`);
        continue;
      }
      const result = await writeIfChanged(join(packageRoot, item.path), item.content);
      log(`  ${result.status.padEnd(10)} ${result.path}`);
    }

    /* (7) Compile the runtime entry point. */
    if (options.compile) {
      const tsconfig = join(packageRoot, 'tsconfig.json');
      if (existsSync(tsconfig)) {
        const tsc = spawnSync(process.execPath, [resolveTypeScriptCli(), '-p', tsconfig], { cwd: packageRoot, encoding: 'utf8' });
        if (tsc.stdout !== '') process.stdout.write(tsc.stdout);
        if (tsc.stderr !== '') process.stderr.write(tsc.stderr);
        if (tsc.status !== 0) {
          fail(`tsc exited with code ${String(tsc.status ?? 'null')}`, 'Runtime module could not be compiled.');
          return;
        }
      } else {
        log(`  skipped tsc (no tsconfig in ${packageRoot})`);
      }
    }

    /* (8) Manifest. */
    const manifest = [
      'tokens.json',
      'src/generated/token-data.ts',
      ...SD_TARGETS.map(([, to]) => to),
      'dist/index.js',
      'dist/index.d.ts',
    ];
    const cssCounts = await collectCssPropertyCounts(packageRoot);
    info('generated files:');
    for (const relativePath of manifest) {
      const absolute = join(packageRoot, relativePath);
      if (!existsSync(absolute)) { log(`  ${relativePath.padEnd(34)} (absent)`); continue; }
      const size = (await stat(absolute)).size;
      const suffix = cssCounts[relativePath] === undefined ? '' : `  ${String(cssCounts[relativePath])} custom properties`;
      log(`  ${relativePath.padEnd(34)} ${String(size).padStart(7)} B${suffix}`);
    }
    info(`tokens — ${String(names.length)} public names (${String(Object.keys(tiers.primitives).length)} primitive, ${String(Object.keys(tiers.base).length)} base, ${String(Object.keys(tiers.semanticsLight).length)} semantic); modes: ${MODES.join(', ')}`);
    if (!hadError) info('OK — DESIGN.md → DTCG → Style Dictionary pipeline complete, gates green.');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

await main();

process.exitCode = hadError ? 1 : (process.exitCode ?? 0);
