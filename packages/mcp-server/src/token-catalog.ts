/**
 * Semantic token resolution for the MCP `query_token` tool.
 *
 * The answer is assembled from the two compiled artifacts and nothing else:
 *
 *   `packages/tokens/tokens.json`        — the DTCG 2025.10 artifact (value, `$type`,
 *                                          `$extensions["designharness"].tier`, alias chain)
 *   `@designharness/tokens` (recipe)     — the resolved public CSS names per mode, the
 *                                          authoritative semantic-role list, and the WCAG
 *                                          2.2 contrast audit captured at build time
 *
 * A role is only ever reported as the CSS custom property the pipeline emitted
 * (`--color-text-secondary`) together with the OKLCH value the artifact holds for that
 * surface. Unknown roles raise {@link UnknownRoleError} instead of falling back to a
 * similar-sounding token: a guessed colour is exactly the failure mode RESEARCH.md §8.3
 * built this tool to prevent.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { getNodeAtPath, resolveValue } from '@designharness/engine';
import { contrastPairs, cssVarName, cssVarReference, semanticRoleList, tierOf } from '@designharness/tokens';
import type { Mode, TokenTier } from '@designharness/tokens';
import { dtcgArtifactPath, toRelative } from './workspace.js';

/** The surfaces the tool accepts (RESEARCH.md §8.3). */
export const SURFACES = ['light', 'dark', 'high-contrast'] as const;
export type Surface = (typeof SURFACES)[number];

/** Surface → the artifact's semantic bucket and the audit's mode. */
const SURFACE_MAP: Record<Surface, { readonly bucket: readonly string[]; readonly mode: Mode }> = {
  light: { bucket: ['color', 'semantic'], mode: 'light' },
  dark: { bucket: ['color', 'semantic', 'dark'], mode: 'dark' },
  'high-contrast': { bucket: ['color', 'semantic', 'highContrast'], mode: 'high-contrast' },
};

/** Raised when a role is not one of the compiled semantic roles. */
export class UnknownRoleError extends Error {
  readonly role: string;
  readonly suggestions: readonly string[];

  constructor(role: string, suggestions: readonly string[]) {
    super(`"${role}" is not a semantic colour role in the compiled token artifact`);
    this.name = 'UnknownRoleError';
    this.role = role;
    this.suggestions = suggestions;
  }
}

export interface RolePair {
  readonly id: string;
  readonly pair: string;
  readonly kind: string;
  readonly requiredRatio: number;
  readonly ratio: number | null;
  readonly pass: boolean;
  /** APCA Lc — diagnostic only; WCAG 2.2 is the gate (RESEARCH.md §7.1). */
  readonly apcaLc: number | null;
}

export interface ResolvedRole {
  readonly semantic_role: string;
  readonly surface: Surface;
  readonly css_var: string;
  readonly usage: string;
  readonly value: string;
  readonly type: string;
  readonly tier: TokenTier | 'unknown';
  readonly dtcg_path: string;
  readonly alias_of: string | null;
  readonly description: string | null;
  readonly mode: Mode;
  readonly contrast: {
    readonly standard: 'WCAG 2.2 AA';
    readonly audited: number;
    readonly failures: number;
    readonly passed: boolean;
    readonly pairs: readonly RolePair[];
  };
  readonly provenance: { readonly artifact: string; readonly artifactSha256: string };
}

interface ArtifactToken {
  readonly $value?: unknown;
  readonly $type?: unknown;
  readonly $description?: unknown;
  readonly $extensions?: { readonly designharness?: { readonly tier?: string; readonly mode?: string } };
}

/** `text-secondary`, `color-text-secondary`, `--color-text-secondary` → the same role. */
export function normaliseRole(raw: string): string {
  const trimmed = raw.trim().replace(/^-+/, '');
  return trimmed.startsWith('color-') ? trimmed : `color-${trimmed}`;
}

/** The roles the artifact compiled, in the order the recipe publishes them. */
export function knownRoles(): readonly string[] {
  return semanticRoleList.map((role) => role.replace(/^color-/, ''));
}

/** Closest roles by shared tokens — offered as a correction, never used as an answer. */
function suggest(raw: string, pool: readonly string[]): string[] {
  const needle = normaliseRole(raw).replace(/^color-/, '');
  const scored = pool
    .map((role) => {
      const a = new Set(role.split('-'));
      const b = new Set(needle.split('-'));
      let shared = 0;
      for (const token of b) if (a.has(token)) shared += 1;
      return { role, shared };
    })
    .filter((entry) => entry.shared > 0)
    .sort((a, b) => b.shared - a.shared || a.role.localeCompare(b.role));
  return scored.slice(0, 5).map((entry) => entry.role);
}

let cachedArtifact: { readonly json: unknown; readonly sha256: string } | undefined;

async function loadArtifact(): Promise<{ readonly json: unknown; readonly sha256: string }> {
  if (cachedArtifact !== undefined) return cachedArtifact;
  const text = await readFile(dtcgArtifactPath, 'utf8');
  cachedArtifact = { json: JSON.parse(text) as unknown, sha256: createHash('sha256').update(text).digest('hex') };
  return cachedArtifact;
}

/** Reset the artifact cache so a rebuild is picked up inside a long-lived process. */
export function resetTokenCache(): void {
  cachedArtifact = undefined;
}

/**
 * Resolve one semantic role for one surface.
 *
 * @throws {UnknownRoleError} when the role was not compiled into the artifact.
 */
/** `unknown` → the DTCG tier union, or undefined when the artifact carries something else. */
function asTier(value: unknown): TokenTier | undefined {
  return value === 'primitive' || value === 'semantic' || value === 'component' ? value : undefined;
}

export async function resolveSemanticRole(rawRole: string, surface: Surface = 'light'): Promise<ResolvedRole> {
  const pool = knownRoles();
  const role = pool.includes(normaliseRole(rawRole).replace(/^color-/, '')) ? normaliseRole(rawRole).replace(/^color-/, '') : undefined;
  if (role === undefined) throw new UnknownRoleError(rawRole, suggest(rawRole, pool));

  const artifact = await loadArtifact();
  const mapping = SURFACE_MAP[surface];
  const path = [...mapping.bucket, role];
  const dottedPath = path.join('.');
  const node = getNodeAtPath(artifact.json, dottedPath) as ArtifactToken | undefined;
  if (node === undefined || typeof node !== 'object' || !('$value' in node)) {
    throw new UnknownRoleError(rawRole, pool.slice(0, 5));
  }

  const resolved = resolveValue(artifact.json, dottedPath);
  const value = typeof resolved === 'string' ? resolved : JSON.stringify(resolved);
  const cssName = `color-${role}`;
  const aliasRaw = typeof node.$value === 'string' ? node.$value : undefined;

  const pairs = contrastPairs({ mode: mapping.mode })
    .filter((record) => record.pair.split(/\son\s/i).some((side) => side.trim() === dottedPath))
    .map((record) => ({
      id: record.id,
      pair: record.pair,
      kind: record.kind,
      requiredRatio: record.required,
      ratio: record.ratio,
      pass: record.pass,
      apcaLc: record.lc,
    }));

  return {
    semantic_role: role,
    surface,
    css_var: cssVarName(cssName),
    usage: cssVarReference(cssName),
    value,
    type: typeof node.$type === 'string' ? node.$type : 'color',
    tier: tierOf(cssName) ?? asTier(node.$extensions?.designharness?.tier) ?? 'unknown',
    dtcg_path: dottedPath,
    alias_of: aliasRaw !== undefined && aliasRaw.startsWith('{') ? aliasRaw.slice(1, -1) : null,
    description: typeof node.$description === 'string' ? node.$description : null,
    mode: mapping.mode,
    contrast: {
      standard: 'WCAG 2.2 AA',
      audited: pairs.length,
      failures: pairs.filter((pair) => !pair.pass).length,
      passed: pairs.every((pair) => pair.pass),
      pairs,
    },
    provenance: { artifact: toRelative(dtcgArtifactPath), artifactSha256: artifact.sha256 },
  };
}

/** The tier of any public token name, straight from the compiled recipe. */
export function tokenTier(cssName: string): TokenTier | undefined {
  return tierOf(cssName);
}

/** Machine-readable dump of the semantic tier for one surface (used by list output). */
export async function semanticSurface(surface: Surface): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const role of knownRoles()) {
    const resolved = await resolveSemanticRole(role, surface);
    out[resolved.css_var] = resolved.value;
  }
  return out;
}
