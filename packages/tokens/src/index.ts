/**
 * `@designharness/tokens` runtime API.
 *
 * Everything here is derived from the compiled artifact (`DESIGN.md` → DTCG
 * tokens.json → Style Dictionary), re-exported from the machine-generated
 * `./generated/token-data.ts`. The module is dependency-free and browser-safe: the
 * WCAG 2.2 audit runs at build time, so no colour math or engine code ships into the
 * app bundle.
 *
 * Names are the frozen TOKEN-API §3 public CSS custom properties without the `--`
 * prefix, so `getToken('color-text-primary')` ↔ `var(--color-text-primary)`.
 */
import {
  baseTokenNames,
  baseValues,
  contrastExcluded,
  contrastGate,
  contrastRecords,
  modes,
  primitiveTokenNames,
  primitiveValues,
  semanticByMode,
  semanticLightValues,
  semanticRoles,
  tokenNames,
} from './generated/token-data.js';
import type { ContrastExclusion, ContrastKind, ContrastRecord, Mode, SemanticRole, TokenName } from './generated/token-data.js';

export type {
  ContrastExclusion,
  ContrastKind,
  ContrastRecord,
  Mode,
  SemanticRole,
  TokenName,
} from './generated/token-data.js';

/** Which token tier a public name belongs to in the DTCG artifact. */
export type TokenTier = 'primitive' | 'semantic' | 'component' | 'system';

/** Options accepted by {@link contrastPairs}. */
export interface ContrastQuery {
  /** Restrict to one colour mode; defaults to every audited mode. */
  readonly mode?: Mode;
  /** Restrict to one WCAG 2.2 measurement class. */
  readonly kind?: ContrastKind;
  /** Keep only the pairs that failed their AA threshold. */
  readonly onlyFailing?: boolean;
}

/** Light mode plus the mode-independent tiers, keyed by public CSS name. */
const lightValues: Readonly<Record<string, string>> = {
  ...primitiveValues,
  ...baseValues,
  ...semanticLightValues,
};

const primitiveNameSet: ReadonlySet<string> = new Set<string>(primitiveTokenNames);
const semanticNameSet: ReadonlySet<string> = new Set<string>(semanticRoles);
const baseNameSet: ReadonlySet<string> = new Set<string>(baseTokenNames);

/**
 * Component-tier names: the `button-*` / `input-*` / `dialog-*` / `table-*` dimension
 * tokens and the `color.<component>.<part>` colour tokens.
 */
function isComponentName(name: string): boolean {
  if (name.startsWith('button-') || name.startsWith('input-') || name.startsWith('dialog-') || name.startsWith('table-')) {
    return true;
  }
  return /^color-.+-(background|foreground)$/.test(name) && !primitiveNameSet.has(name);
}

/** Every public token name the pipeline emits, sorted. */
export const tokenNameList: readonly TokenName[] = tokenNames;

/** The 29 semantic colour roles — the tier `ui` and `showcase` are allowed to consume. */
export const semanticRoleList: readonly SemanticRole[] = semanticRoles;

/** The four colour modes, in cascade order. */
export const modeList: readonly Mode[] = modes;

/** Primitive-tier names (every DESIGN.md colour, OKLCH-normalised, all mode buckets). */
export const primitiveList: readonly string[] = primitiveTokenNames;

/** Mode-independent names (system scales plus component dimensions). */
export const baseList: readonly string[] = baseTokenNames;

/** True when `value` is one of the four contract modes. */
export function isMode(value: string): value is Mode {
  return (modes as readonly string[]).includes(value);
}

/** Semantic roles per mode, widened so an unvalidated mode string cannot throw. */
const modeTables: Readonly<Record<string, Readonly<Record<string, string>>>> = { ...semanticByMode };

/**
 * Resolved value of a token, e.g. `getToken('color-text-primary', 'dark')`.
 *
 * A leading `--` is accepted (and ignored) so callers can pass the CSS custom property
 * name straight from a stylesheet. Non-colour tokens are mode-independent and
 * therefore resolve in every mode; semantic colours resolve through that mode's own
 * recomposition. Unknown names give `undefined` instead of throwing, so consumers can
 * probe optional roles.
 */
export function getToken(rawName: string, mode: Mode = 'light'): string | undefined {
  const cssName = rawName.startsWith('--') ? rawName.slice(2) : rawName;
  const perMode = modeTables[mode];
  if (perMode !== undefined) {
    const recomposed: string | undefined = perMode[cssName];
    if (recomposed !== undefined) return recomposed;
  }
  return lightValues[cssName];
}

/** `color-surface` → `--color-surface` (the TOKEN-API §3 custom property name). */
export function cssVarName(cssName: string): string {
  return `--${cssName.replace(/^-{1,2}/, '')}`;
}

/** `color-surface` → `var(--color-surface)`, for authored CSS and inline styles. */
export function cssVarReference(cssName: string): string {
  return `var(${cssVarName(cssName)})`;
}

/** Which DTCG tier a public token name was compiled from (`undefined` if not a token). */
export function tierOf(rawName: string): TokenTier | undefined {
  const cssName = rawName.replace(/^-{1,2}/, '');
  if (primitiveNameSet.has(cssName)) return 'primitive';
  if (semanticNameSet.has(cssName)) return 'semantic';
  if (isComponentName(cssName)) return 'component';
  if (baseNameSet.has(cssName)) return 'system';
  return undefined;
}

/** Every public name belonging to `tier`, sorted. */
export function tokenNamesForTier(tier: TokenTier): readonly string[] {
  switch (tier) {
    case 'primitive':
      return primitiveTokenNames;
    case 'semantic':
      return semanticRoles;
    case 'component':
      return tokenNames.filter((name) => isComponentName(name));
    case 'system':
      return baseTokenNames.filter((name) => !isComponentName(name));
  }
}

/**
 * WCAG 2.2 AA results measured against the compiled artifact at build time by
 * `@designharness/engine` (`auditContrast` / `auditPairs`).
 *
 * `ratio` / `pass` are the only blocking numbers. `lc` is the APCA diagnostic for the
 * same pair — reported, never gated (WCAG 2.2 is the sole hard standard).
 */
export function contrastPairs(query: ContrastQuery = {}): readonly ContrastRecord[] {
  const { mode, kind, onlyFailing = false } = query;
  return contrastRecords.filter((record) => {
    if (mode !== undefined && record.mode !== mode) return false;
    if (kind !== undefined && record.kind !== kind) return false;
    if (onlyFailing && record.pass) return false;
    return true;
  });
}

/** Pairs a mode cannot source (a role that inherits its light value there). */
export function contrastExcludedPairs(): readonly ContrastExclusion[] {
  return contrastExcluded;
}

/** Snapshot of the contrast gate this artifact was built under. */
export const contrastAudit: ContrastGate = contrastGate;

/** Shape of {@link contrastGateSummary}. */
export interface ContrastGate {
  readonly audited: number;
  readonly failures: number;
  readonly apcaAdvisories: number;
  readonly passed: boolean;
}

/** Semantic colour roles resolved for one mode, for theme-switching code. */
export function semanticRoleByMode(mode: Mode): Readonly<Record<string, string>> {
  return semanticByMode[mode];
}
