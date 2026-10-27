/**
 * The contrast audit matrix shared by the build gate (`scripts/build.mjs`) and the
 * token test suite, so the numbers a release is gated on are exactly the numbers the
 * tests assert.
 *
 * WCAG 2.2 is the only blocking standard: normal text 4.5:1, large text 3:1,
 * non-text UI 3:1 (SC 1.4.11). APCA `Lc` is measured for every pair and reported as
 * an advisory — it can never set `passed` to false (RESEARCH §3.3, DESIGN.md §Colors).
 *
 * Every pair is a semantic role combination declared in DESIGN.md §Colors prose; the
 * harness never invents a pair to make a gate pass.
 */
import { auditContrast, auditPairs, getNodeAtPath } from '@designharness/engine';

/** The four colour modes, in cascade order (TOKEN-API §3). */
export const MODES = ['light', 'dark', 'high-contrast', 'high-contrast-dark'];

/** DTCG path segment for the semantic tier of each mode. */
export const MODE_SEGMENT = {
  light: [],
  dark: ['dark'],
  'high-contrast': ['highContrast'],
  'high-contrast-dark': ['highContrastDark'],
};

/** Which primitive bucket each mode recomposes from (provenance, see `pairIsAuditable`). */
export const MODE_BUCKET = {
  light: 'light',
  dark: 'dark',
  'high-contrast': 'hc',
  'high-contrast-dark': 'hcDark',
};

/** WCAG 2.2 AA thresholds per measurement class. */
export const WCAG_AA = { text: 4.5, 'large-text': 3, ui: 3 };

/** APCA readability guide; advisory only, never a gate. */
export const APCA_ADVISORY_LC = 60;

/**
 * `[foreground, background, kind]` semantic role pairs.
 *
 * Grouped by the guarantee DESIGN.md makes for each one: body ink on every surface it
 * is used against, interaction ink on its fill, state pairs (badge ink on badge
 * background), inverse text on the overlay, and the non-text control boundaries.
 */
export const SEMANTIC_PAIRS = [
  ['text-primary', 'canvas', 'text'],
  ['text-primary', 'surface', 'text'],
  ['text-primary', 'surface-sunken', 'text'],
  ['text-primary', 'surface-raised', 'text'],
  ['text-secondary', 'canvas', 'text'],
  ['text-secondary', 'surface', 'text'],
  ['text-secondary', 'surface-sunken', 'text'],
  ['on-primary', 'primary', 'text'],
  ['on-primary', 'primary-hover', 'text'],
  ['on-primary', 'primary-pressed', 'text'],
  ['on-primary-subtle', 'primary-subtle', 'text'],
  ['primary', 'surface', 'text'],
  ['primary', 'canvas', 'text'],
  ['success', 'surface', 'text'],
  ['warning', 'surface', 'text'],
  ['danger', 'surface', 'text'],
  ['on-success-subtle', 'success-subtle', 'text'],
  ['on-warning-subtle', 'warning-subtle', 'text'],
  ['on-danger-subtle', 'danger-subtle', 'text'],
  ['on-danger', 'danger', 'text'],
  ['text-inverse', 'overlay', 'text'],
  // Large-type usages (display/heading sizes ≥ 24px, or ≥ 18.66px bold): SC 1.4.3 large.
  ['text-primary', 'surface', 'large-text'],
  ['text-inverse', 'overlay', 'large-text'],
  // Non-text UI contrast (SC 1.4.11): the control boundary and the focus indicator.
  ['border-strong', 'surface', 'ui'],
  ['border-strong', 'canvas', 'ui'],
  ['focus', 'surface', 'ui'],
  ['border-selected', 'surface', 'ui'],
];

/** The DTCG path of a semantic role in a mode. */
export function semanticPath(mode, role) {
  return ['color', 'semantic', ...MODE_SEGMENT[mode], role].join('.');
}

/**
 * Which primitive bucket a semantic role's alias resolves to
 * (`light` | `dark` | `hc` | `hcDark`), or `null` when it is not a primitive alias.
 */
export function aliasBucket(artifact, dottedPath) {
  const node = getNodeAtPath(artifact, dottedPath);
  const raw = node && node.$value;
  if (typeof raw !== 'string') return null;
  const match = /^\{color\.primitive\.(?:(dark|hc|hcDark)\.)?([^}]+)\}$/.exec(raw);
  if (match === null) return null;
  return match[1] === undefined ? 'light' : match[1];
}

/**
 * A pair is auditable in a mode when both sides share provenance: either both were
 * re-composed for that mode, or both inherit the light value (then the pair *is* the
 * light pair). Mixed provenance means one side has no sourced value for that mode —
 * DESIGN.md never declared it, so the harness must not invent a number. Such pairs
 * are reported as diagnostics instead of gating on a misleading ratio.
 */
export function pairIsAuditable(artifact, mode, foreground, background) {
  const fgBucket = aliasBucket(artifact, semanticPath(mode, foreground));
  const bgBucket = aliasBucket(artifact, semanticPath(mode, background));
  if (fgBucket === null || bgBucket === null) return { auditable: false, reason: 'not-a-primitive-alias' };
  const wanted = MODE_BUCKET[mode];
  const fgNative = fgBucket === wanted;
  const bgNative = bgBucket === wanted;
  if (fgNative === bgNative) return { auditable: true, provenance: fgNative ? 'native' : 'inherited' };
  return {
    auditable: false,
    reason: 'mixed-provenance',
    detail: `${foreground}→color.primitive.${fgBucket === 'light' ? 'light' : `${fgBucket}.${foreground}`}, ${background}→color.primitive.${bgBucket === 'light' ? 'light' : `${bgBucket}.${background}`}`,
  };
}

const round = (value, digits) => (typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(digits)) : null);

/**
 * Measure the whole audit surface of one artifact: the fg/bg pairs the artifact itself
 * declares (colour component tier plus the engine baseline) and the semantic role
 * matrix for every mode.
 *
 * `failures` is WCAG 2.2 only; `apcaAdvisories` never feeds into it.
 */
export function buildContrastReport(artifact) {
  const records = [];
  const excluded = [];

  const push = (result, mode, provenance) => {
    records.push({
      id: `${mode}/${result.id}`,
      mode,
      pair: `${result.fgPath} on ${result.bgPath}`,
      kind: result.kind,
      required: WCAG_AA[result.kind] ?? WCAG_AA.text,
      ratio: round(result.ratio, 3),
      pass: result.pass,
      normalAA: result.normalAA,
      largeAA: result.largeAA,
      uiAA: result.uiAA,
      lc: round(result.lc, 2),
      provenance,
    });
  };

  // (a) every pair the artifact declares.
  for (const result of auditContrast(artifact).results) push(result, 'light', 'artifact');

  // (b) the semantic role matrix, once per mode, filtered by provenance.
  for (const mode of MODES) {
    const auditable = [];
    const provenanceById = new Map();
    for (const [foreground, background, kind] of SEMANTIC_PAIRS) {
      const verdict = pairIsAuditable(artifact, mode, foreground, background);
      if (!verdict.auditable) {
        excluded.push({ mode, pair: `${foreground} on ${background}`, kind, reason: verdict.reason, detail: verdict.detail ?? '' });
        continue;
      }
      const id = `${foreground}-on-${background}-${kind}`;
      provenanceById.set(id, verdict.provenance);
      auditable.push({ id, fgPath: semanticPath(mode, foreground), bgPath: semanticPath(mode, background), kind });
    }
    for (const result of auditPairs(auditable, artifact).results) push(result, mode, provenanceById.get(result.id) ?? 'unknown');
  }

  records.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  excluded.sort((a, b) => (`${a.mode}/${a.pair}/${a.kind}` < `${b.mode}/${b.pair}/${b.kind}` ? -1 : 1));
  const failures = records.filter((record) => !record.pass);
  const apcaAdvisories = records.filter((record) => record.lc === null || Math.abs(record.lc) < APCA_ADVISORY_LC);
  return { records, excluded, failures, apcaAdvisories };
}
