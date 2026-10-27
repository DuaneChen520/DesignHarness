/**
 * Canonical mapping between the DTCG artifact token path and the public CSS
 * custom-property name (TOKEN-API.md §3). This is the SINGLE source of truth for
 * naming — the DTCG builder, the Style Dictionary name transform, the per-mode CSS
 * formats and the accessibility gates all go through it, so the compiled CSS and
 * the audited values can never disagree.
 *
 * Rules (from §3):
 *  - top-level group is retained as a prefix;
 *  - for `color.semantic.*` the tier segment `semantic` and any mode segment
 *    (`dark` / `highContrast` / `highContrastDark`) are stripped, so all modes of a
 *    role share one public name (`--color-text-primary`);
 *  - for `color.component.*` the `component` segment is stripped
 *    (`--color-button-primary-background`);
 *  - for `color.primitive.*` the `primitive` segment AND the mode bucket are kept
 *    (`--color-primitive-dark-canvas`) so primitives never collide with semantics;
 *  - `font.lineHeight.*` / `font.letterSpacing.*` drop the `font` group prefix to
 *    yield `--line-height-*` / `--letter-spacing-*`; every other sub-group keeps it.
 */

/** Semantic-mode segments removed from the public name. */
const SEMANTIC_MODE_SEGMENTS = new Set(['semantic', 'dark', 'highContrast', 'highContrastDark']);

/** camelCase → kebab-case, leaving already-kebab segments untouched. */
export function kebab(segment: string): string {
  return segment.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Compute the CSS custom property base name (without the `--` prefix) for a token
 * path, per the rules above.
 */
export function cssNameFromPath(path: readonly string[]): string {
  if (path.length === 0) return '';
  const segments = path as string[];
  const group = segments[0]!;

  if (group === 'font' && (segments[1] === 'lineHeight' || segments[1] === 'letterSpacing')) {
    return segments.slice(1).map(kebab).join('-');
  }

  if (group === 'color') {
    const tier = segments[1];
    if (tier === 'primitive') {
      // keep primitive + bucket + leaf
      return segments.map(kebab).join('-');
    }
    if (tier === 'semantic') {
      const rest = segments.slice(2).filter((s) => !SEMANTIC_MODE_SEGMENTS.has(s));
      return ['color', ...rest].map(kebab).join('-');
    }
    if (tier === 'component') {
      const rest = segments.slice(2);
      return ['color', ...rest].map(kebab).join('-');
    }
  }

  return segments.map(kebab).join('-');
}

/** Full CSS custom property token, e.g. `--color-text-primary`. */
export function cssVarName(path: readonly string[]): string {
  return `--${cssNameFromPath(path)}`;
}
