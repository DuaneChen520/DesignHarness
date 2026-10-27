/**
 * Tier 2 — PR Fast Gate: DESIGN.md intent + drift audit.
 *
 * Runs the OFFICIAL `@google/design.md` linter against the Intent SSOT. Any `error`
 * finding blocks the merge; warnings are reported as diagnostics only. `diff` compares
 * the intent file against a previous version to surface unintended token drift.
 *
 * RESEARCH.md §7 sensor 0.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const designMd = join(workspaceRoot, 'DESIGN.md');

function locateCli() {
  const candidates = [
    join(workspaceRoot, 'packages/engine/node_modules/@google/design.md/dist/index.js'),
    join(workspaceRoot, 'node_modules/@google/design.md/dist/index.js'),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found === undefined) {
    throw new Error('@google/design.md CLI not found — run `pnpm install` (it is a dependency of @designharness/engine).');
  }
  return found;
}

function runCli(args) {
  const result = spawnSync(process.execPath, [locateCli(), ...args], {
    cwd: workspaceRoot,
    encoding: 'utf8',
  });
  if (result.error !== undefined) throw result.error;
  return result;
}

function parseJson(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`could not parse @google/design.md output as JSON:\n${stdout.slice(0, 800)}`);
  }
}

export function lintIntent(path = designMd) {
  const result = runCli(['lint', '--format', 'json', path]);
  const report = parseJson(result.stdout);
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const summary = report.summary ?? {};
  const errors = Number(summary.errors ?? findings.filter((f) => f.severity === 'error').length);
  const warnings = Number(summary.warnings ?? findings.filter((f) => f.severity === 'warning').length);
  return { errors, warnings, findings, exitStatus: result.status };
}

function parseArgs(argv) {
  const againstIndex = argv.indexOf('--against');
  const designIndex = argv.indexOf('--design');
  const json = argv.includes('--json');
  return {
    json,
    against: againstIndex === -1 ? undefined : argv[againstIndex + 1],
    design: designIndex === -1 ? designMd : resolve(process.cwd(), argv[designIndex + 1]),
  };
}

export function main(argv = process.argv.slice(2)) {
  const { json, against, design } = parseArgs(argv);

  if (!existsSync(design)) {
    console.error(`[tier2] FAIL: Intent SSOT missing at ${design}`);
    return 1;
  }

  let audit;
  try {
    audit = lintIntent(design);
  } catch (error) {
    console.error(`[tier2] FAIL: ${String(error.message)}`);
    return 1;
  }

  let drift;
  if (against !== undefined) {
    const other = resolve(process.cwd(), against);
    if (!existsSync(other)) {
      console.error(`[tier2] FAIL: --against file does not exist: ${other}`);
      return 1;
    }
    drift = parseJson(runCli(['diff', '--format', 'json', design, other]).stdout);
  }

  if (json) {
    console.log(JSON.stringify({ lint: audit, drift: drift ?? null }, null, 2));
  } else {
    console.log(`[tier2] @google/design.md lint — ${String(audit.errors)} error(s), ${String(audit.warnings)} warning(s)`);
    for (const finding of audit.findings) {
      const prefix = finding.severity === 'error' ? '  ERROR' : finding.severity === 'warning' ? '  warn ' : '  info ';
      console.log(`${prefix} [${String(finding.rule ?? 'structure')}] ${String(finding.path ?? '')} — ${String(finding.message ?? '')}`);
    }
    if (drift !== undefined) {
      console.log('[tier2] @google/design.md diff — regression flag: ' + String(Boolean(drift.regression)));
      console.log(JSON.stringify(drift.tokens ?? {}, null, 2));
    }
  }

  if (audit.errors > 0) {
    console.error(`[tier2] BLOCKED: ${String(audit.errors)} intent error(s). WCAG/token integrity is a hard merge gate.`);
    return 1;
  }
  if (drift !== undefined && drift.regression === true) {
    console.error('[tier2] BLOCKED: design drift detected between intent revisions.');
    return 1;
  }
  if (!json) console.log('[tier2] PASS — intent valid, no errors.');
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]).endsWith('tier2-designmd.mjs')) {
  process.exitCode = main();
}
