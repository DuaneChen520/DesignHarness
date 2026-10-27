/**
 * Thin wrapper around the official `@google/design.md` linter.
 *
 * `lintIntent(path)` reads a DESIGN.md file and returns an aggregate of
 * `{ errors, warnings, findings }`. The linter is synchronous and can throw on
 * unrecoverable parse failures; we normalise that into a single error finding so
 * callers always get a structured report and the Tier-2 gate can key off
 * `errors === 0`.
 *
 * @see https://github.com/google-labs-code/design.md
 */
import { readFile } from 'node:fs/promises';
import { lint } from '@google/design.md/linter';
import type { DesignMdFinding, LintIntentResult } from './types.js';

/** Lint raw DESIGN.md content (no file I/O). */
export function lintContent(content: string): LintIntentResult {
  try {
    const report = lint(content);
    const findings: DesignMdFinding[] = report.findings.map((f) => ({
      severity: f.severity,
      path: f.path,
      message: f.message,
      rule: f.rule,
    }));
    return { errors: report.summary.errors, warnings: report.summary.warnings, findings };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      errors: 1,
      warnings: 0,
      findings: [{ severity: 'error', message: `Linter failed: ${message}`, rule: 'linter-throw' }],
    };
  }
}

/**
 * Lint a DESIGN.md file on disk. `errors === 0` is the Tier-2 PR gate contract.
 */
export async function lintIntent(path: string): Promise<LintIntentResult> {
  const content = await readFile(path, 'utf8');
  return lintContent(content);
}
