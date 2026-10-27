/**
 * DTCG (W3C Design Tokens Format, 2025.10) structural types used by the harness
 * artifact builder. These model the JSON we emit; the upstream exporter owns the
 * *input* (primitive colour) shape, so this module focuses on the synthesised
 * artifact we hand to Style Dictionary.
 */

/** Reserved `$`-prefixed member names permitted by the DTCG spec. */
export const DTCG_RESERVED = ['$value', '$type', '$description', '$extensions', '$schema'] as const;

/** Tier metadata attached via `$extensions.designharness`. */
export type TokenTier = 'primitive' | 'semantic' | 'component';

/** Semantic surface mode a token belongs to. */
export type TokenMode = 'light' | 'dark' | 'high-contrast' | 'high-contrast-dark';

/** The designharness extension object. */
export interface HarnessExtension {
  readonly tier: TokenTier;
  readonly mode: TokenMode;
}

/** A single DTCG token (`$value` + reserved members). */
export interface DtcgToken {
  readonly $value: string | number | readonly unknown[] | Record<string, unknown>;
  readonly $type?: string;
  readonly $description?: string;
  readonly $extensions?: { readonly designharness: HarnessExtension };
}

/** A DTCG group node: arbitrary children + optional group-level `$type`. */
export interface DtcgGroup {
  readonly $type?: string;
  readonly $description?: string;
  [member: string]: unknown;
}

/** The artifact is a top-level DTCG group. */
export type DtcgArtifact = DtcgGroup;

/** A resolved colour pair used by the accessibility gates. */
export interface AuditPair {
  /** Semantic public name of the foreground token, e.g. `"text-primary"`. */
  readonly fgRole: string;
  /** Semantic public name of the background token, e.g. `"surface"`. */
  readonly bgRole: string;
  /** Where the pair is used, e.g. `"button-primary"`. */
  readonly usage: string;
  /** Whether the pair is body text (4.5:1) / large text or UI (3:1). */
  readonly kind: 'text' | 'large-text' | 'ui';
}

/** A token whose value must be read back out of the artifact for auditing. */
export interface ArtifactTokenView {
  readonly path: readonly string[];
  readonly $value: unknown;
}
