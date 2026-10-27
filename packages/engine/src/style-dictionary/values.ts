/**
 * Shared helpers that turn Style Dictionary's transformed tokens into the concrete
 * strings we emit into CSS / Tailwind / JSON. Kept separate so both the custom
 * formats and the recipe generator agree on how every `$type` renders.
 */
import type { TransformedToken } from 'style-dictionary/types';
import { cssNameFromPath } from '../dtcg/css-name.js';

/** The four colour modes the harness compiles. */
export type Mode = 'light' | 'dark' | 'high-contrast' | 'high-contrast-dark';

export const MODES: readonly Mode[] = ['light', 'dark', 'high-contrast', 'high-contrast-dark'];

/** `color-scheme` value per mode (TOKEN-API §3 cascade). */
export function colorSchemeFor(mode: Mode): 'light' | 'dark' {
  return mode === 'dark' || mode === 'high-contrast-dark' ? 'dark' : 'light';
}

/** Which mode a token path belongs to (via its mode segment), defaulting to light. */
export function modeForPath(path: readonly string[]): Mode {
  if (path[0] !== 'color') return 'light';
  const seg = path[2];
  if (seg === 'dark') return 'dark';
  if (seg === 'highContrast') return 'high-contrast';
  if (seg === 'highContrastDark') return 'high-contrast-dark';
  return 'light';
}

interface ShadowComponent {
  readonly color?: unknown;
  readonly offsetX?: unknown;
  readonly offsetY?: unknown;
  readonly blur?: unknown;
  readonly spread?: unknown;
}

/** Render a DTCG shadow object into a CSS box-shadow string. */
export function shadowToCss(value: ShadowComponent): string {
  const parts: string[] = [];
  const push = (v: unknown): void => {
    if (v === undefined || v === null) return;
    parts.push(String(v));
  };
  push(value['offsetX'] ?? '0px');
  push(value['offsetY'] ?? '0px');
  push(value['blur'] ?? '0px');
  push(value['spread'] ?? '0px');
  push(value['color'] ?? 'transparent');
  return parts.join(' ');
}

/**
 * Render a resolved token value to its final CSS/JSON string. We detect composite
 * `$type`s by SHAPE rather than trusting Style Dictionary to surface the inherited
 * group `$type` on each leaf: arrays are cubicBéziers (only easing uses them), and
 * objects with a shadow-shaped key are box-shadows. SD types `token.value` as `any`,
 * so we narrow to `unknown` immediately to keep the ESLint `no-unsafe-*` gate clean.
 *
 * NOTE: with `usesDtcg: true` (v5) Style Dictionary resolves DTCG `$value` aliases
 * onto `token.$value` and leaves the legacy `token.value` member undefined, so both
 * members are read here — `$value` first.
 */
export function renderValue(token: TransformedToken): string {
  const raw: unknown = token.$value ?? token.value;
  if (Array.isArray(raw)) {
    const nums = (raw as readonly unknown[]).map((n) => String(n));
    return `cubic-bezier(${nums.join(', ')})`;
  }
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    if ('offsetX' in obj || 'offsetY' in obj || 'blur' in obj || 'spread' in obj) {
      return shadowToCss(obj as ShadowComponent);
    }
    return JSON.stringify(raw);
  }
  return String(raw);
}

/** The public CSS name (no `--`) for a token. */
export function publicName(token: TransformedToken): string {
  return cssNameFromPath(token.path as string[]);
}
