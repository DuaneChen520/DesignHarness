/**
 * Runs the tiered sensor model in order and prints one summary table.
 *
 * `--tier 1..4` runs a single tier; `--quick` stops after Tier 3 (the PR set).
 * The first failing tier aborts, because the tiers are a dependency chain: an intent file
 * that does not lint makes the axe run meaningless.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));

const TIERS = [
  { tier: 1, name: 'Pre-commit AST', file: 'tier1-precommit.mjs', blocking: 'commit' },
  { tier: 2, name: 'Intent / drift', file: 'tier2-designmd.mjs', blocking: 'merge' },
  { tier: 3, name: 'Types + axe WCAG 2.2 AA', file: 'tier3-standard.mjs', blocking: 'merge' },
  { tier: 4, name: 'Visual + contract (release)', file: 'tier4-release.mjs', blocking: 'release' },
];

function parse(argv) {
  const tierIndex = argv.indexOf('--tier');
  return { only: tierIndex === -1 ? undefined : Number(argv[tierIndex + 1]), quick: argv.includes('--quick') };
}

export function main(argv = process.argv.slice(2)) {
  const { only, quick } = parse(argv);
  const selected = only === undefined ? (quick ? TIERS.slice(0, 3) : TIERS) : TIERS.filter((entry) => entry.tier === only);

  if (selected.length === 0) {
    console.error(`[verify] unknown tier "${String(only)}" — valid tiers are 1..4`);
    return 2;
  }

  const results = [];
  for (const entry of selected) {
    const script = join(workspaceRoot, 'tooling/gates', entry.file);
    if (!existsSync(script)) {
      console.error(`[verify] FAIL: ${entry.file} does not exist — a missing gate is itself a gate failure.`);
      results.push({ ...entry, status: 'missing' });
      break;
    }
    console.log(`\n═══ Tier ${String(entry.tier)} — ${entry.name} (blocks ${entry.blocking}) ═══`);
    const started = Date.now();
    const result = spawnSync(process.execPath, [script], { cwd: workspaceRoot, stdio: 'inherit' });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const status = (result.status ?? 1) === 0 ? 'pass' : 'fail';
    results.push({ ...entry, status, seconds });
    if (status !== 'pass') break;
  }

  console.log('\n╔══ Design System Harness — sensor summary ══');
  for (const entry of results) {
    const icon = entry.status === 'pass' ? '✓' : entry.status === 'fail' ? '✗' : '!';
    const timing = 'seconds' in entry ? ` (${entry.seconds}s)` : '';
    console.log(`║ ${icon} Tier ${String(entry.tier)} ${entry.name.padEnd(30)} ${entry.status}${timing}`);
  }
  for (const entry of selected.slice(results.length)) {
    console.log(`║ · Tier ${String(entry.tier)} ${entry.name.padEnd(30)} not run`);
  }
  console.log('╚════════════════════════════════════════════');

  const failed = results.filter((entry) => entry.status !== 'pass');
  if (failed.length > 0) {
    console.error(`[verify] BLOCKED: ${String(failed.length)} tier(s) failed or were missing.`);
    return 1;
  }
  console.log('[verify] PASS — every selected tier is green.');
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]).endsWith('verify-all.mjs')) {
  process.exitCode = main();
}
