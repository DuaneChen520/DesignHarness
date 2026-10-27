/**
 * Classifies the flat token list into the named sets the CSS / Tailwind / recipe
 * formats consume. This is the single place that decides which tokens are
 * mode-independent (`base`), primitives, and per-mode semantics.
 */
import type { TransformedToken } from 'style-dictionary/types';
import { MODES, modeForPath, publicName, renderValue, type Mode } from './values.js';

/** Public CSS names that belong to the frozen §3 semantic colour surface. */
export interface ResolvedSets {
  /** Mode-independent tokens: all non-colour groups + colour component tokens. */
  readonly base: Record<string, string>;
  /** Colour primitive leaves (public `color-primitive-*` names). */
  readonly primitives: Record<string, string>;
  /** Per-mode semantic colours (public `color-*` names → value). */
  readonly semantics: Record<Mode, Record<string, string>>;
  /** The 29 semantic colour role CSS base names (light tier). */
  readonly semanticRoleNames: string[];
}

/** Compute the resolved sets from Style Dictionary's transformed token list. */
export function computeSets(allTokens: readonly TransformedToken[]): ResolvedSets {
  const base: Record<string, string> = {};
  const primitives: Record<string, string> = {};
  const semantics = {} as Record<Mode, Record<string, string>>;
  for (const mode of MODES) semantics[mode] = {};
  const semanticRoleNames: string[] = [];

  for (const token of allTokens) {
    const path = token.path as string[];
    const name = publicName(token);
    const value = renderValue(token);

    if (path[0] === 'color' && path[1] === 'primitive') {
      primitives[name] = value;
      continue;
    }
    if (path[0] === 'color' && path[1] === 'semantic') {
      const mode = modeForPath(path);
      semantics[mode]![name] = value;
      if (mode === 'light') semanticRoleNames.push(name);
      continue;
    }
    // Everything else (colour component + all non-colour groups) is mode-independent.
    base[name] = value;
  }

  return { base, primitives, semantics, semanticRoleNames };
}
