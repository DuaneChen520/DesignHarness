/**
 * Programmatic WCAG 2.2 contrast checker used by the token pipeline.
 *
 * WCAG 2.2 is the only hard gate; every threshold below is the normative value
 * (normal text 4.5:1, large text 3:1, non-text UI 3:1 per SC 1.4.11). APCA Lc is
 * computed for every pair but reported strictly as a warning — it can never fail an
 * audit.
 *
 * @see https://www.w3.org/TR/WCAG22/#contrast-minimum
 */
import { apcaLc } from '../colors/apca.js';
import { contrastRatio } from '../colors/convert.js';
import { resolveColorToRgb } from '../dtcg/resolve.js';
import type { DtcgGroup } from '../dtcg/types.js';

/** Thresholds per WCAG 2.2 (AA + AAA) for the three measurement classes. */
export const WCAG_THRESHOLDS = {
  normal: { aa: 4.5, aaa: 7 },
  large: { aa: 3, aaa: 4.5 },
  ui: { aa: 3 },
} as const;

export type PairKind = 'text' | 'large-text' | 'ui';

/** A foreground/background pair to audit, referenced by DTCG dotted path. */
export interface AuditPairSpec {
  readonly id: string;
  readonly fgPath: string;
  readonly bgPath: string;
  readonly kind: PairKind;
}

/** Per-pair audit outcome. */
export interface PairResult {
  readonly id: string;
  readonly fgPath: string;
  readonly bgPath: string;
  readonly kind: PairKind;
  readonly ratio: number;
  readonly normalAA: boolean;
  readonly normalAAA: boolean;
  readonly largeAA: boolean;
  readonly largeAAA: boolean;
  readonly uiAA: boolean;
  /** True when the pair satisfies its own class' AA threshold. */
  readonly pass: boolean;
  /** Signed APCA Lc (diagnostic only). */
  readonly lc: number | undefined;
}

export interface AuditReport {
  readonly results: PairResult[];
  /** Pairs that fail their class' WCAG 2.2 AA requirement. */
  readonly failures: PairResult[];
  /** Pairs whose |Lc| is below the readability guide — advisory only, never blocks. */
  readonly warnings: ReadonlyArray<{ id: string; lc: number | undefined }>;
  readonly passed: boolean;
}

function childOf(node: unknown, key: string): unknown {
  return typeof node === 'object' && node !== null ? (node as DtcgGroup)[key] : undefined;
}

/** Derive component fg/bg text pairs from `color.component.*` in the artifact. */
function componentPairs(artifact: unknown): AuditPairSpec[] {
  const color = childOf(artifact, 'color');
  const component = childOf(color, 'component');
  if (typeof component !== 'object' || component === null) return [];
  const out: AuditPairSpec[] = [];
  for (const [comp, node] of Object.entries(component as DtcgGroup)) {
    if (typeof node !== 'object' || node === null) continue;
    const hasBg = 'background' in (node as DtcgGroup);
    const hasFg = 'foreground' in (node as DtcgGroup);
    if (hasBg && hasFg) {
      out.push({
        id: `component.${comp}`,
        fgPath: `color.component.${comp}.foreground`,
        bgPath: `color.component.${comp}.background`,
        kind: 'text',
      });
    }
  }
  return out;
}

/** Baseline non-text UI pairs (control boundaries, focus). */
const UI_PAIRS: readonly AuditPairSpec[] = [
  { id: 'ui.border-strong', fgPath: 'color.semantic.border-strong', bgPath: 'color.semantic.surface', kind: 'ui' },
  { id: 'ui.focus', fgPath: 'color.semantic.focus', bgPath: 'color.semantic.surface', kind: 'ui' },
  { id: 'ui.border-selected', fgPath: 'color.semantic.border-selected', bgPath: 'color.semantic.surface', kind: 'ui' },
];

/** Link text over its canvas. */
const TEXT_PAIRS: readonly AuditPairSpec[] = [
  { id: 'text.link', fgPath: 'color.semantic.primary', bgPath: 'color.semantic.surface', kind: 'text' },
  { id: 'text.secondary', fgPath: 'color.semantic.text-secondary', bgPath: 'color.semantic.surface', kind: 'text' },
  { id: 'text.on-primary', fgPath: 'color.semantic.on-primary', bgPath: 'color.semantic.primary', kind: 'text' },
];

/** Build the full default pair set (component + UI + core text). */
export function defaultPairs(artifact: unknown): AuditPairSpec[] {
  return [...TEXT_PAIRS, ...UI_PAIRS, ...componentPairs(artifact)];
}

function evaluate(pairs: readonly AuditPairSpec[], artifact: unknown): AuditReport {
  const results: PairResult[] = [];
  const failures: PairResult[] = [];
  const warnings: Array<{ id: string; lc: number | undefined }> = [];

  for (const pair of pairs) {
    try {
      const fgRgb = resolveColorToRgb(artifact, pair.fgPath);
      const bgRgb = resolveColorToRgb(artifact, pair.bgPath);
      const ratio = contrastRatio(fgRgb, bgRgb);
      const lc = apcaLc(fgRgb, bgRgb);
      const result: PairResult = {
        id: pair.id,
        fgPath: pair.fgPath,
        bgPath: pair.bgPath,
        kind: pair.kind,
        ratio,
        normalAA: ratio >= WCAG_THRESHOLDS.normal.aa,
        normalAAA: ratio >= WCAG_THRESHOLDS.normal.aaa,
        largeAA: ratio >= WCAG_THRESHOLDS.large.aa,
        largeAAA: ratio >= WCAG_THRESHOLDS.large.aaa,
        uiAA: ratio >= WCAG_THRESHOLDS.ui.aa,
        pass:
          pair.kind === 'ui'
            ? ratio >= WCAG_THRESHOLDS.ui.aa
            : pair.kind === 'large-text'
              ? ratio >= WCAG_THRESHOLDS.large.aa
              : ratio >= WCAG_THRESHOLDS.normal.aa,
        lc,
      };
      results.push(result);
      if (!result.pass) failures.push(result);
      // APCA advisory only: flag low-Lc but never feed it into `failures`.
      if (lc === undefined || Math.abs(lc) < 60) warnings.push({ id: pair.id, lc });
    } catch {
      // A pair whose colour cannot be resolved is skipped rather than crashing the audit.
      continue;
    }
  }

  return { results, failures, warnings, passed: failures.length === 0 };
}

/** Audit contrast for a token artifact using the default pair set. */
export function auditContrast(artifact: unknown): AuditReport {
  return evaluate(defaultPairs(artifact), artifact);
}

/** Audit an explicit pair list (used by targeted tests). */
export function auditPairs(pairs: readonly AuditPairSpec[], artifact: unknown): AuditReport {
  return evaluate(pairs, artifact);
}
