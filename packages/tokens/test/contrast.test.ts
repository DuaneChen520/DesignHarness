/**
 * WCAG 2.2 is the only hard gate in this harness (RESEARCH §3.3, DESIGN.md §Colors).
 *
 * Every number here is measured against the compiled artifact through
 * `@designharness/engine` — the tests never restate a colour, so an artifact change
 * cannot be hidden by a stale expectation. APCA `Lc` is measured for the same pairs
 * and asserted to be *reported but non-blocking*.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { auditContrast, auditPairs } from '@designharness/engine';

import { MODES, SEMANTIC_PAIRS, WCAG_AA, buildContrastReport, pairIsAuditable, semanticPath } from '../scripts/contrast-matrix.mjs';
import { contrastPairs } from '../src/index.js';
import { freshBuildRoot, packageRoot } from './helpers/pipeline.js';

type Artifact = unknown;

let artifact: Artifact;
let report: ReturnType<typeof buildContrastReport>;

/** `[fg on bg] ratio:1 (needs N:1)` for every failing pair. */
function describeFailures(failures: readonly { id: string; pair: string; kind: string; ratio: number | null }[]): string {
  return failures
    .map((failure) => `${failure.id} — ${failure.pair} measured ${String(failure.ratio)}:1, needs ${String(WCAG_AA[failure.kind as keyof typeof WCAG_AA])}:1`)
    .join('\n');
}

beforeAll(() => {
  const root = freshBuildRoot();
  artifact = JSON.parse(readFileSync(join(root, 'tokens.json'), 'utf8'));
  report = buildContrastReport(artifact);
});

describe('WCAG 2.2 AA gate over the compiled artifact', () => {
  it('clears AA for every foreground/background pair the artifact itself declares', () => {
    const audit = auditContrast(artifact);
    const failing = audit.results.filter((result) => !result.pass);
    expect(
      failing.map((result) => `${result.id}: ${result.ratio.toFixed(2)}:1`),
      `component pairs failed WCAG 2.2 AA:\n${describeFailures(failing)}`,
    ).toEqual([]);
    expect(audit.passed).toBe(true);
    // The artifact declares the component tier pairs (button/input/dialog/table/badge/link).
    expect(audit.results.filter((result) => result.id.startsWith('component.')).length).toBeGreaterThanOrEqual(15);
  });

  it('clears AA for the semantic ink/surface matrix in all four modes', () => {
    expect(report.records.length, 'no pairs were audited').toBeGreaterThan(100);
    expect(
      report.failures.map((record) => record.id),
      `semantic pairs failed WCAG 2.2 AA:\n${describeFailures(report.failures)}`,
    ).toEqual([]);
    for (const mode of MODES) {
      const audited = report.records.filter((record) => record.mode === mode && record.provenance !== 'artifact');
      expect(audited.length, `${mode} was not audited`).toBeGreaterThan(15);
    }
  });

  it('holds body ink at 4.5:1, large ink at 3:1 and UI boundaries at 3:1', () => {
    for (const record of report.records) {
      const required = WCAG_AA[record.kind as keyof typeof WCAG_AA];
      expect(record.required, `${record.id} carries the wrong threshold`).toBe(required);
      if (record.ratio === null) continue;
      if (record.kind === 'text') {
        expect(record.ratio, `text pair ${record.id} is below 4.5:1 (${String(record.ratio)})`).toBeGreaterThanOrEqual(4.5);
        expect(record.normalAA).toBe(true);
      } else {
        expect(record.ratio, `${record.kind} pair ${record.id} is below 3:1 (${String(record.ratio)})`).toBeGreaterThanOrEqual(3);
        expect(record.kind === 'ui' ? record.uiAA : record.largeAA).toBe(true);
      }
    }
  });

  it('keeps the non-text UI boundary and focus tokens above 3:1 against their surface', () => {
    const pairs = MODES.flatMap((mode) => [
      { id: `${mode}/ui-border-strong`, fgPath: semanticPath(mode, 'border-strong'), bgPath: semanticPath(mode, 'surface'), kind: 'ui' },
      { id: `${mode}/ui-focus`, fgPath: semanticPath(mode, 'focus'), bgPath: semanticPath(mode, 'surface'), kind: 'ui' },
      { id: `${mode}/ui-border-selected`, fgPath: semanticPath(mode, 'border-selected'), bgPath: semanticPath(mode, 'surface'), kind: 'ui' },
    ]);
    const audit = auditPairs(pairs, artifact);
    const below = audit.results.filter((result) => result.ratio < 3);
    expect(below.map((result) => `${result.id}: ${result.ratio.toFixed(2)}:1`), `SC 1.4.11 violated:\n${describeFailures(below)}`).toEqual([]);
    expect(audit.results.length).toBe(pairs.length);
  });

  it('covers every declared semantic pair, and only excludes unsourced ones', () => {
    const declared = MODES.length * SEMANTIC_PAIRS.length;
    const matrixRecords = report.records.filter((record) => record.provenance !== 'artifact');
    expect(matrixRecords.length + report.excluded.length).toBe(declared);
    for (const exclusion of report.excluded) {
      expect(exclusion.reason, `unexpected exclusion reason ${exclusion.reason}`).toBe('mixed-provenance');
    }
    // DESIGN.md declares no dark/hc hover or pressed fill, so those roles inherit the
    // light primitive; the harness reports that instead of gating on a made-up number.
    const skipped = new Set(report.excluded.map((exclusion) => `${exclusion.mode}/${exclusion.pair}`));
    expect(skipped.has('dark/on-primary on primary-hover')).toBe(true);
  });
});

describe('APCA is a diagnostic channel, never a gate', () => {
  it('reports a finite Lc for every audited pair', () => {
    const missing = report.records.filter((record) => typeof record.lc !== 'number' || !Number.isFinite(record.lc as number));
    expect(missing.map((record) => record.id), 'APCA Lc was not measured for every pair').toEqual([]);
    expect(report.records.every((record) => typeof record.ratio === 'number')).toBe(true);
  });

  it('advises on low Lc values while the WCAG gate stays green', () => {
    expect(report.failures.length).toBe(0);
    expect(report.apcaAdvisories.length, 'expected at least one low-Lc pair to prove advisories are measured').toBeGreaterThan(0);
    const advisory = report.apcaAdvisories.find((record) => record.pass && Math.abs((record.lc as number) ?? 100) < 60);
    expect(advisory, 'no pair both passes WCAG AA and has a low Lc').toBeDefined();
    // The gate status is a function of WCAG alone: a failing APCA with a passing WCAG
    // must not appear in `failures`.
    expect(report.failures.some((record) => record.id === (advisory as { id: string }).id)).toBe(false);
    const audit = auditContrast(artifact);
    expect(audit.passed).toBe(true);
  });

  it('exposes the build-time audit through the runtime API without drifting', () => {
    const runtime = contrastPairs();
    expect(runtime.length).toBe(report.records.length);
    const liveById = new Map(report.records.map((record) => [record.id, record]));
    const drifted = runtime.filter((record) => {
      const live = liveById.get(record.id);
      return live === undefined || live.ratio !== record.ratio || live.pass !== record.pass || live.lc !== record.lc;
    });
    expect(drifted.map((record) => record.id), 'src/generated drifts from a live audit of the artifact').toEqual([]);
    expect(contrastPairs({ mode: 'dark' }).every((record) => record.mode === 'dark')).toBe(true);
    expect(contrastPairs({ kind: 'ui' }).every((record) => record.kind === 'ui')).toBe(true);
    expect(contrastPairs({ onlyFailing: true })).toEqual([]);
  });
});

describe('artifact colour provenance', () => {
  it('audits a pair only when both sides share their mode provenance', () => {
    expect(pairIsAuditable(artifact, 'light', 'text-primary', 'surface').auditable).toBe(true);
    const mixed = pairIsAuditable(artifact, 'dark', 'on-primary', 'primary-hover');
    expect(mixed.auditable).toBe(false);
    expect(mixed.reason).toBe('mixed-provenance');
    const inherited = pairIsAuditable(artifact, 'dark', 'on-success-subtle', 'success-subtle');
    expect(inherited.auditable).toBe(true);
    expect(inherited.provenance).toBe('inherited');
  });

  it('measures the checked-in artifact identically to the fresh one', () => {
    const checkedIn: Artifact = JSON.parse(readFileSync(join(packageRoot, 'tokens.json'), 'utf8'));
    const second = buildContrastReport(checkedIn);
    expect(JSON.stringify(second.records)).toEqual(JSON.stringify(report.records));
  });
});
