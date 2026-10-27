/**
 * Tier 3 — PR Standard Gate: type safety + WCAG 2.2 AA zero violations.
 *
 * Two sensors, both rigid:
 *   1. `tsc --noEmit` in every workspace package (Props/type completeness).
 *   2. axe-core over the showcase fixture matrix with the explicit WCAG 2.2 tag set,
 *      including `wcag22aa` — without that tag axe never evaluates SC 2.5.8 `target-size`
 *      (RESEARCH.md §7.1 "避坑配置").
 *
 * APCA `Lc` is printed as an advisory channel and is structurally incapable of changing the
 * exit code: only WCAG 2.2 blocks a merge (RESEARCH.md §3.3).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const IS_WINDOWS = process.platform === 'win32';

const PACKAGES = ['engine', 'tokens', 'primitives', 'ui', 'contracts', 'registry', 'mcp-server', 'cli'];

function run(command, args, cwd) {
  const result = spawnSync(command, [...args], { cwd, encoding: 'utf8', shell: IS_WINDOWS });
  if (result.error !== undefined) throw result.error;
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

const pnpm = (args, cwd) => run('pnpm', args, cwd);

/** Node 22.11+ is a hard contract: Style Dictionary 5 and @changesets/cli@3 both require it. */
export function assertNodeVersion() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  const supported = major >= 26 || (major === 24 && minor >= 11) || (major === 22 && minor >= 11);
  if (!supported) {
    console.error(`[tier3] BLOCKED: Node ${process.versions.node} does not satisfy the engines contract "^22.11 || ^24 || >=26".`);
    return 1;
  }
  console.log(`[tier3] Node ${process.versions.node} satisfies the engines contract.`);
  return 0;
}

export function typecheck() {
  console.log('[tier3] sensor 4 — TypeScript (tsc --noEmit) per package');
  let checked = 0;
  for (const name of PACKAGES) {
    const dir = join(workspaceRoot, 'packages', name);
    if (!existsSync(join(dir, 'tsconfig.json'))) continue;
    const result = pnpm(['exec', 'tsc', '-p', 'tsconfig.json', '--noEmit'], dir);
    if (result.status !== 0) {
      console.error(`[tier3] BLOCKED: typecheck failed for @designharness/${name}\n${result.stdout}${result.stderr}`);
      return 1;
    }
    checked += 1;
    console.log(`  ✓ @designharness/${name}`);
  }

  const showcase = join(workspaceRoot, 'apps/showcase');
  if (existsSync(join(showcase, 'tsconfig.json'))) {
    const result = pnpm(['exec', 'tsc', '-p', 'tsconfig.json', '--noEmit'], showcase);
    if (result.status !== 0) {
      console.error(`[tier3] BLOCKED: typecheck failed for apps/showcase\n${result.stdout}${result.stderr}`);
      return 1;
    }
    checked += 1;
    console.log('  ✓ @designharness/showcase');
  }

  if (checked === 0) {
    console.error('[tier3] BLOCKED: no tsconfig.json was found — the type sensor would have checked nothing.');
    return 1;
  }
  console.log(`[tier3] TypeScript clean across ${String(checked)} package(s).`);
  return 0;
}

/**
 * axe-core WCAG 2.2 AA gate. Fails if the tag set did not take effect, if fixture coverage
 * regressed, or if any violation is reported.
 */
export function accessibility() {
  console.log('[tier3] sensor 2 — axe-core WCAG 2.2 AA (tags: wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa)');
  const showcase = join(workspaceRoot, 'apps/showcase');
  const result = pnpm(['exec', 'playwright', 'test', 'e2e/a11y.spec.ts', '--project=chromium', '--reporter=list'], showcase);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0) {
    console.error('[tier3] BLOCKED: axe-core reported WCAG 2.2 AA violations (or the coverage/scan assertion failed).');
    return 1;
  }
  if (!/violations=0/.test(result.stdout)) {
    console.error('[tier3] BLOCKED: the a11y run printed no violations=0 summary, so this gate cannot certify the scan.');
    return 1;
  }
  return 0;
}

/** APCA advisories, printed only — never gating. */
export function apcaAdvisories() {
  const reportPath = join(workspaceRoot, 'packages/tokens/reports/apca-advisories.json');
  if (!existsSync(reportPath)) {
    console.log('[tier3] APCA advisories not published (run `pnpm --filter @designharness/tokens build` first) — diagnostic channel skipped.');
    return;
  }
  try {
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    const entries = Array.isArray(report) ? report : (report.records ?? []);
    console.log(`[tier3] APCA diagnostics (advisory only, never gating): ${String(entries.length)} pair(s) below the readability guide`);
    for (const entry of entries.slice(0, 10)) {
      console.log(`  · ${String(entry.id)} Lc=${String(entry.lc)} (WCAG ${String(entry.ratio)}:1 passes — not a gate)`);
    }
  } catch (error) {
    console.warn(`[tier3] could not read the APCA advisory file: ${String(error)}`);
  }
}

export function main() {
  const steps = [
    ['engines', assertNodeVersion],
    ['typecheck', typecheck],
    ['axe-core', accessibility],
  ];

  for (const [name, step] of steps) {
    const status = step();
    if (status !== 0) {
      console.error(`\n[tier3] BLOCKED at ${name}.`);
      return 1;
    }
    if (name === 'axe-core') apcaAdvisories();
  }

  console.log('\n[tier3] PASS — types clean and WCAG 2.2 AA violations = 0.');
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]).endsWith('tier3-standard.mjs')) {
  process.exitCode = main();
}
