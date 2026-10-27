/**
 * Typed view of a DESIGN.md document (Intent SSOT) — the machine-readable YAML
 * front matter plus the partitioned prose sections. Types are deliberately
 * structural (no zod here); the official `@google/design.md` linter is the
 * authority on validity, this model is the authority on *access*.
 */

/** One `##`-level prose section of the document body. */
export interface DocumentSection {
  /** Heading text exactly as authored, e.g. `"Elevation & Depth"`. */
  readonly heading: string;
  /** Markdown content under the heading, up to the next same-or-higher heading. */
  readonly content: string;
}

/** A typography style entry from `typography:`. Values stay raw (strings/numbers). */
export interface TypographyStyle {
  readonly [key: string]: string | number | undefined;
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: number | string;
  lineHeight?: number | string;
  letterSpacing?: string;
  fontFeature?: string;
  fontVariation?: string;
}

/** A component entry from `components:` — property bag of raw strings (may contain references). */
export type ComponentStyle = Record<string, string | number>;

/** The parsed YAML front matter. */
export interface DesignFrontmatter {
  readonly version?: string;
  readonly name?: string;
  readonly description?: string;
  /** name → authored hex string. */
  readonly colors: Record<string, string>;
  /** style name → raw typography properties. */
  readonly typography: Record<string, TypographyStyle>;
  /** scale name → dimension string ("8px"). */
  readonly rounded: Record<string, string>;
  /** scale name → dimension string ("16px"). */
  readonly spacing: Record<string, string>;
  /** component name → raw properties (`"{colors.x}"` refs unresolved). */
  readonly components: Record<string, ComponentStyle>;
  /** Top-level YAML keys outside the known schema. */
  readonly unknownKeys: string[];
}

/** A full parsed document. */
export interface DesignDocument {
  readonly frontmatter: DesignFrontmatter;
  readonly body: string;
  readonly sections: DocumentSection[];
}

/** A `{group.name}` reference found in a component property. */
export interface TokenReference {
  /** The owner path of the reference, e.g. `"components.button-primary.backgroundColor"`. */
  readonly owner: string;
  /** The raw reference text, e.g. `"{colors.primary}"`. */
  readonly raw: string;
  /** Group part, e.g. `"colors"`. */
  readonly group: string;
  /** Dotted key inside the group, e.g. `"primary"` or `"body-md"`. */
  readonly key: string;
}

/** A reference that could not be resolved against the front matter. */
export interface BrokenReference extends TokenReference {
  /** Human-readable reason. */
  readonly reason: string;
}

/** Result of resolving all `{…}` references in a document. */
export interface ReferenceResolution {
  /** All `{…}` references found, resolvable or not. */
  readonly references: TokenReference[];
  /** References that failed to resolve. */
  readonly broken: BrokenReference[];
  /** owner path → resolved raw value. */
  readonly resolved: Map<string, string | number>;
}

/** A violation of the canonical section order or presence. */
export interface SectionOrderIssue {
  readonly kind: 'out-of-order' | 'unknown-section';
  readonly heading: string;
  readonly message: string;
}

/** A single lint finding as reported by the official `@google/design.md` linter. */
export interface DesignMdFinding {
  readonly severity: 'error' | 'warning' | 'info';
  readonly path?: string;
  readonly message: string;
  readonly rule?: string;
}

/** Summary returned by {@link lintIntent}. */
export interface LintIntentResult {
  readonly errors: number;
  readonly warnings: number;
  readonly findings: DesignMdFinding[];
}
