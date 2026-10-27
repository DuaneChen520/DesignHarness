/**
 * Tier 1 — Pre-commit sensor.
 *
 * Pure AST scanning (Stylelint + ESLint), no build products required, so it is fast
 * enough to run on every commit. It rigidly blocks: hardcoded colours, non-tokenised
 * pixel lengths, `!important`, and in-source colour literals in TSX.
 *
 * RESEARCH.md §7: "刚性阻断提交（极速，纯本地 AST 扫描）".
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const workspaceRoot = resolve(here, '..', '..');

const IS_WINDOWS = process.platform === 'win32';

/**
 * Runs a command with inherited stdio and returns its exit code.
 * `shell` is only enabled on Windows so that `pnpm` resolves through its `.cmd` shim.
 */
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? workspaceRoot,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: IS_WINDOWS,
    encoding: 'utf8',
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  };
}

export function pnpmRun(args, options) {
  return run('pnpm', args, options);
}

function header(text) {
  console.log(`\n[tier1] ${text}`);
}

/** Packages that own authored CSS or source. A gate that matched nothing must fail loudly. */
const CSS_TARGETS = ['packages/ui/src', 'apps/showcase/src', 'packages/tokens/tailwind'];
const JS_TARGETS = ['packages/engine/src', 'packages/engine/test', 'packages/primitives/src', 'packages/primitives/test', 'packages/ui/src', 'packages/ui/test', 'packages/contracts/src', 'packages/contracts/test', 'packages/registry/src', 'packages/mcp-server/src', 'packages/cli/src', 'apps/showcase/src', 'apps/showcase/e2e', 'tooling'];

export function main() {
  let failures = 0;

  const cssTargets = CSS_TARGETS.filter((target) => existsSync(join(workspaceRoot, target)));
  if (cssTargets.length === 0) {
    console.error('[tier1] FAIL: no authored CSS directories exist — the Stylelint sensor would scan nothing.');
    return 1;
  }

  header(`stylelint (hardcoded colour / px / !important / token-reference) over ${cssTargets.length} target(s)`);
  // Each glob is its own argv entry: stylelint treats a comma-joined string as one pattern and
  // reports "no files found" — a silent sensor, which this gate must never allow.
  const stylelint = pnpmRun(['exec', 'stylelint', ...cssTargets.map((target) => `${target}/**/*.css`)], { capture: false });
  if (stylelint.status !== 0) {
    console.error('[tier1] FAIL: Stylelint reported hardcoded or non-tokenised CSS.');
    failures += 1;
  }

  const jsTargets = JS_TARGETS.filter((target) => existsSync(join(workspaceRoot, target)));
  if (jsTargets.length === 0) {
    console.error('[tier1] FAIL: no source directories exist — the ESLint sensor would scan nothing.');
    return failures + 1;
  }

  header(`eslint over ${jsTargets.length} target(s)`);
  const eslint = pnpmRun(['exec', 'eslint', ...jsTargets], { capture: false });
  if (eslint.status !== 0) {
    console.error('[tier1] FAIL: ESLint reported errors (colour literals in source are a hard violation).');
    failures += 1;
  }

  if (failures > 0) {
    console.error(`\n[tier1] BLOCKED: ${String(failures)} sensor(s) failed. Commit is rejected.`);
    return 1;
  }
  console.log('\n[tier1] PASS — AST sensors clean.');
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]).endsWith('tier1-precommit.mjs')) {
  process.exitCode = main();
}
