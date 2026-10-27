/**
 * Shared, cross-module value types for the harness engine.
 *
 * Colours are carried around as plain sRGB channel triples in the 0–255 range
 * (integers) plus an optional alpha 0–1, never as `rgb()` / hex string literals
 * in source, so the Tier-1 ESLint colour gate stays satisfied while still
 * allowing real colour math.
 */

/** An sRGB colour as three 0–255 channels (integer for discrete colours). */
export type Rgb = readonly [number, number, number];

/** An sRGB colour with an alpha channel in 0–1. */
export type Rgba = readonly [number, number, number, number];

/** Linear-light sRGB channels in 0–1. */
export type LinearRgb = readonly [number, number, number];

/** CIE OKLab: L in 0–1, a/b neutral-axis coordinates (typically −0.4…0.4). */
export type Oklab = readonly [number, number, number];

/** CSS OKLCH: L 0–1, chroma ≥ 0, hue in degrees 0–360. */
export type Oklch = readonly [number, number, number];

/**
 * A parsed DESIGN.md colour entry. Kept minimal on purpose — the full model is
 * owned by the design.md linter; this is only what the harness needs to drive
 * colour math.
 */
export interface DesignColor {
  /** Original hex string exactly as authored (e.g. `"#1A5FD0"`). */
  readonly hex: string;
  readonly rgb: Rgb;
}
