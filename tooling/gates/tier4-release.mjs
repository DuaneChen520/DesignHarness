/**
 * Tier 4 — Nightly / Release Gate (RESEARCH.md §7: "阻断发版，不阻塞日常特性迭代").
 *
 * Depth over speed: cross-kernel Playwright visual regression, the browser-side OpenAPI/MSW
 * contract round-trip, the whole vitest graph, and the token pipeline's idempotence (which is
 * what proves `tokens.json` is generated and never hand-edited).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const IS_WINDOWS = process.platform === 'win32';

function run(command, args, cwd = workspaceRoot) {
  const result = spawnSync(command, [...args], { cwd, encoding: 'utf8', shell: IS_WINDOWS });
  if (result.error !== undefined) throw result.error;
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

const pnpm = (args, cwd = workspaceRoot) => run('pnpm', args, cwd);

function step(label, args, cwd) {
  console.log(`\n[tier4] ${label}`);
  const result = cwd === undefined ? pnpm(args) : pnpm(args, cwd);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  return result.status === 0;
}

export function main() {
  const showcase = join(workspaceRoot, 'apps/showcase');
  if (!existsSync(showcase)) {
    console.error('[tier4] BLOCKED: apps/showcase is missing — the release gate has nothing to measure.');
    return 1;
  }

  const checks = [
    ['build the whole graph (turbo run build)', ['turbo', 'run', 'build'], undefined],
    ['unit + integration tests (turbo run test)', ['turbo', 'run', 'test'], undefined],
    ['token pipeline idempotence (tokens.json is generated, never hand-edited)', ['--filter', '@designharness/tokens', 'build'], undefined],
    ['OpenAPI / MSW contract tests (node)', ['--filter', '@designharness/contracts', 'test'], undefined],
    ['cross-kernel visual regression + browser contract round-trip', ['exec', 'playwright', 'test', '--reporter=list'], showcase],
  ];

  const failed = [];
  for (const [label, args, cwd] of checks) {
    if (!step(label, args, cwd)) failed.push(label);
  }

  if (failed.length > 0) {
    console.error(`\n[tier4] BLOCKED (release): ${String(failed.length)} check(s) failed:\n${failed.map((label) => `  · ${label}`).join('\n')}`);
    return 1;
  }
  console.log('\n[tier4] PASS — release candidates are visually stable and contract-clean.');
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]).endsWith('tier4-release.mjs')) {
  process.exitCode = main();
}
