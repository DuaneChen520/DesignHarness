/**
 * Component metadata model produced by the ts-morph extractor. This is a FROZEN
 * cross-package signature — `packages/contracts` consumes it verbatim.
 */

export interface PropMetadata {
  readonly name: string;
  /** Readable type string, e.g. `"ButtonVariant"` rendered as a union of literals. */
  readonly type: string;
  readonly required: boolean;
  /** Source-derived default (destructured initializer or `defaultProps`). */
  readonly default?: string;
  /** Leading JSDoc description. */
  readonly description?: string;
  /** `@deprecated` note when present. */
  readonly deprecation?: string;
}

export interface EventMetadata {
  readonly name: string;
  /** The function type signature, e.g. `"(value: string) => void"`. */
  readonly signature: string;
  readonly description?: string;
}

export interface ComponentMetadataEntry {
  readonly id: string;
  readonly name: string;
  readonly sourceFile: string;
  readonly props: PropMetadata[];
  readonly events: EventMetadata[];
}

export interface ExtractOptions {
  readonly sourceFiles: string[];
  readonly tsconfig?: string;
  readonly displayName?: string;
}
