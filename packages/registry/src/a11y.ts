/**
 * Accessibility evidence for a distributed component.
 *
 * The harness gates accessibility at Tier 3 with axe-core (RESEARCH.md §7.1 sensor 2),
 * which runs in the showcase app — a package this one must not depend on. So the
 * registry reports what it can actually prove, in two layers:
 *
 * 1. `contrast` — measured, and provable right now: the compiled token artifact carries
 *    the WCAG 2.2 AA audit for every foreground/background pair the pipeline produced
 *    (`@designharness/tokens` `contrastPairs()`), and a component's own stylesheet names
 *    the colour tokens it paints with. Intersecting those two real datasets gives the
 *    contrast result per component, with no invented numbers.
 * 2. `axe` — the axe-core run itself. It is only ever reported when a machine-readable
 *    report exists on disk: the showcase's Playwright a11y project writes
 *    `apps/showcase/reports/a11y.json` (an explicit `DESIGNHARNESS_A11Y_REPORT` path
 *    overrides it). Without that file the status is `not-run`, which is the truth, rather
 *    than a badge copied into a JSON.
 *
 * `status` collapses the two: any measured failure blocks, a passing axe report plus
 * clean contrast verifies, everything else is provisional.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { contrastPairs, tierOf } from '@designharness/tokens';
import type { ContrastRecord } from '@designharness/tokens';
import { workspaceRoot, toRelative } from './paths.js';

/** Where the Tier-3 axe-core report is expected, in priority order. */
export const AXE_REPORT_CANDIDATES: readonly string[] = [
  process.env['DESIGNHARNESS_A11Y_REPORT'] ?? '',
  join(workspaceRoot, 'apps', 'showcase', 'reports', 'a11y.json'),
  join(workspaceRoot, 'apps', 'showcase', 'test-results', 'a11y.json'),
  join(workspaceRoot, 'packages', 'ui', 'reports', 'a11y.json'),
].filter((path) => path.length > 0);

export type GateStatus = 'verified' | 'provisional' | 'blocked';

/** The WCAG 2.2 AA pairs a component paints with, from the compiled artifact. */
export interface ContrastEvidence {
  readonly audited: number;
  readonly failures: number;
  readonly pairs: ReadonlyArray<{
    readonly id: string;
    readonly mode: string;
    readonly pair: string;
    readonly kind: string;
    readonly required: number;
    readonly ratio: number | null;
    readonly pass: boolean;
    /** APCA Lc — advisory channel, never a gate (RESEARCH.md §7.1). */
    readonly lc: number | null;
  }>;
}

/** The axe-core layer, straight from the Tier-3 report. */
export interface AxeEvidence {
  readonly status: 'passed' | 'failed' | 'not-run';
  readonly report: string;
  readonly violations: number;
  readonly incomplete: number;
}

export interface A11yEvidence {
  readonly status: GateStatus;
  readonly standard: 'WCAG 2.2 AA';
  readonly gate: 3;
  readonly axe: AxeEvidence;
  readonly contrast: ContrastEvidence;
  readonly reasons: readonly string[];
}

/** One entry of the axe report, in either of the two shapes the gate may emit. */
interface AxeEntry {
  readonly violations: number;
  readonly incomplete: number;
}

function countField(record: Record<string, unknown>, keys: readonly string[]): number {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  if (Array.isArray(record['violations'])) return (record['violations'] as unknown[]).length;
  return 0;
}

/**
 * Normalise a report into `component id → counts`. Accepted shapes:
 * `{ components: { button: { violations, incomplete } } }`,
 * `{ results: [{ id, violations, incomplete }] }`, or the bare map. Playwright's own
 * JSON reporter is not one of them, so it is not silently treated as a pass.
 */
function normaliseAxeReport(parsed: unknown): Map<string, AxeEntry> | undefined {
  const roots: unknown[] = [];
  if (parsed !== null && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    roots.push(record['components'], record['results'], record);
  }

  const out = new Map<string, AxeEntry>();
  for (const root of roots) {
    if (root === undefined || root === null || typeof root !== 'object') continue;
    if (Array.isArray(root)) {
      for (const raw of root) {
        if (raw === null || typeof raw !== 'object') continue;
        const entry = raw as Record<string, unknown>;
        const id = typeof entry['id'] === 'string' ? entry['id'] : typeof entry['component'] === 'string' ? entry['component'] : undefined;
        if (id === undefined) continue;
        out.set(id, { violations: countField(entry, ['violations', 'violationCount']), incomplete: countField(entry, ['incomplete', 'incompleteCount']) });
      }
      continue;
    }
    for (const [id, raw] of Object.entries(root as Record<string, unknown>)) {
      if (raw === null || typeof raw !== 'object') continue;
      const entry = raw as Record<string, unknown>;
      out.set(id, { violations: countField(entry, ['violations', 'violationCount']), incomplete: countField(entry, ['incomplete', 'incompleteCount']) });
    }
  }
  return out.size > 0 ? out : undefined;
}

let cachedReport: { readonly path: string; readonly entries: Map<string, AxeEntry> } | undefined;
let cachedReportRead = false;

async function readAxeReport(): Promise<{ readonly path: string; readonly entries: Map<string, AxeEntry> } | undefined> {
  if (cachedReportRead) return cachedReport;
  cachedReportRead = true;
  for (const path of AXE_REPORT_CANDIDATES) {
    if (!existsSync(path)) continue;
    try {
      const entries = normaliseAxeReport(JSON.parse(await readFile(path, 'utf8')));
      if (entries !== undefined) cachedReport = { path, entries };
    } catch {
      // An unreadable report is a missing report: the registry says `not-run`, it does
      // not guess that the run was clean.
      cachedReport = undefined;
    }
    break;
  }
  return cachedReport;
}

/** Reset the report cache — the tests write a fixture report and re-read it. */
export function resetA11yCache(): void {
  cachedReport = undefined;
  cachedReportRead = false;
}

/**
 * The DTCG path a public CSS custom property resolves to, when the WCAG audit can have
 * measured it. `--color-primary` is `color.semantic.primary`; `--color-button-primary-background`
 * is `color.component.button-primary.background`. Both mappings are the frozen naming rule
 * in TOKEN-API.md §3, and the tier comes from the compiled artifact itself (`tierOf`), not
 * from a guess. Primitives and system scales are excluded: the audit measures pairs.
 */
export function dtcgColorPath(cssName: string): string | undefined {
  const name = cssName.replace(/^-+/, '');
  if (!name.startsWith('color-')) return undefined;
  const tier = tierOf(name);
  const tail = name.slice('color-'.length);
  if (tier === 'semantic') return `color.semantic.${tail}`;
  if (tier === 'component') {
    for (const layer of ['foreground', 'background'] as const) {
      if (tail.endsWith(`-${layer}`)) return `color.component.${tail.slice(0, -(layer.length + 1))}.${layer}`;
    }
  }
  return undefined;
}

/** Split an audit record's `pair` text into the two DTCG paths it measured. */
function pairSides(pair: string): string[] {
  return pair.split(/\son\s/i).map((side) => side.trim());
}

/**
 * The audited pairs a component can actually paint with: every foreground/background pair
 * in the compiled artifact whose measurement involves a colour token the component's own
 * stylesheet references.
 */
export function contrastEvidenceFor(cssVariables: readonly string[]): ContrastEvidence {
  const paths = new Set(cssVariables.map((variable) => dtcgColorPath(variable)).filter((path): path is string => path !== undefined));
  const matched = new Map<string, ContrastRecord>();
  for (const record of contrastPairs()) {
    const sides = pairSides(record.pair);
    if (sides.some((side) => paths.has(side))) matched.set(record.id, record);
  }
  const pairs = [...matched.values()]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((record) => ({
      id: record.id,
      mode: record.mode,
      pair: record.pair,
      kind: record.kind,
      required: record.required,
      ratio: record.ratio,
      pass: record.pass,
      lc: record.lc,
    }));
  return { audited: pairs.length, failures: pairs.filter((pair) => !pair.pass).length, pairs };
}

/**
 * Accessibility evidence for one component. `cssVariables` are the `var(--…)` names its
 * own stylesheet references, which is what ties the token audit to the component.
 */
export async function resolveA11yEvidence(componentId: string, cssVariables: readonly string[]): Promise<A11yEvidence> {
  const contrast = contrastEvidenceFor(cssVariables);
  const report = await readAxeReport();
  const entry = report?.entries.get(componentId);

  const axe: AxeEvidence =
    report === undefined || entry === undefined
      ? {
          status: 'not-run',
          report: report === undefined ? `no axe-core report found in: ${AXE_REPORT_CANDIDATES.map(toRelative).join(', ')}` : `${toRelative(report.path)} has no entry for "${componentId}"`,
          violations: 0,
          incomplete: 0,
        }
      : {
          status: entry.violations === 0 && entry.incomplete === 0 ? 'passed' : 'failed',
          report: toRelative(report.path),
          violations: entry.violations,
          incomplete: entry.incomplete,
        };

  const reasons: string[] = [];
  if (axe.status === 'failed') reasons.push(`axe-core reported ${String(axe.violations)} violation(s) and ${String(axe.incomplete)} incomplete check(s)`);
  if (contrast.failures > 0) reasons.push(`${String(contrast.failures)} WCAG 2.2 AA contrast pair(s) failed in the compiled artifact`);
  if (axe.status === 'not-run') reasons.push('the Tier-3 axe-core run has not produced a report for this component');
  if (contrast.audited === 0) reasons.push('the component stylesheet references no color.component token, so contrast cannot be measured from it');

  const status: GateStatus = axe.status === 'failed' || contrast.failures > 0 ? 'blocked' : axe.status === 'passed' && contrast.audited > 0 ? 'verified' : 'provisional';

  return { status, standard: 'WCAG 2.2 AA', gate: 3, axe, contrast, reasons };
}
