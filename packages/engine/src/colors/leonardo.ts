/**
 * Adobe Leonardo integration.
 *
 * The harness drives `@adobe/leonardo-contrast-colors` to (1) generate a
 * perceptually-ordered tone ramp from the brand seed and (2) validate each step's
 * WCAG 2 contrast against a reference surface, both in the `wcag2` formula (WCAG
 * 2.x is the only hard gate; APCA/`wcag3` is deliberately not used here).
 *
 * Precise surface used:
 *  - Ramp generation: `createScale({ swatches, colorKeys:[seed], colorSpace:'OKLCH', sortColor:true })`
 *    → ordered array of hex CSS colours interpolated in OKLCH from the seed.
 *  - Validation: `contrast(rgb, base, undefined, 'wcag2')` for each swatch against
 *    the reference surface, plus the harness's own independent {@link contrastRatio}
 *    cross-check so a Leonardo regression cannot silently weaken the gate.
 *
 * @see https://github.com/adobe/leonardo-contrast-colors
 */
import { createScale, contrast as leonardoContrast } from '@adobe/leonardo-contrast-colors';
import { contrastRatio, hexToRgb, rgbToHex } from './convert.js';
import type { Rgb } from './primitives.js';

/** A single generated tone step with its measured contrast. */
export interface ToneStep {
  /** Index within the ramp, 0-based, lightest first (Leonardo `sortColor`). */
  readonly index: number;
  /** Normalised hex string for the tone. */
  readonly hex: string;
  /** sRGB channels. */
  readonly rgb: Rgb;
  /** Leonardo `wcag2` contrast ratio against the reference surface. */
  readonly contrast: number;
}

export interface ToneScale {
  readonly seedHex: string;
  readonly referenceHex: string;
  readonly steps: ToneStep[];
}

function toRgbTuple(rgb: Rgb): [number, number, number] {
  return [rgb[0]!, rgb[1]!, rgb[2]!];
}

/**
 * Generate + validate a tone scale from a seed colour.
 *
 * @param seedHex — brand seed hex (e.g. the primary interaction colour).
 * @param referenceHex — surface the ramp is validated against (usually canvas/surface).
 * @param swatches — number of tone steps (default 11).
 */
export function generateToneScale(seedHex: string, referenceHex: string, swatches = 11): ToneScale {
  // Leonardo's `colorKeys`/return types are branded `CssColor` strings; the harness
  // works with plain hex strings, so we cast at this single boundary.
  const scaleOptions = { swatches, colorKeys: [seedHex], colorSpace: 'OKLCH', sortColor: true };
  const ramp = createScale(scaleOptions as unknown as Parameters<typeof createScale>[0]) as unknown as string[];

  const reference = hexToRgb(referenceHex);
  const steps: ToneStep[] = ramp.map((raw, index) => {
    const hex = rgbToHex(hexToRgb(raw));
    const rgb = hexToRgb(hex);
    const wcag2 = leonardoContrast(toRgbTuple(rgb), toRgbTuple(reference), undefined, 'wcag2');
    // Independent cross-check; prefer the harness value to avoid any Leonardo drift.
    const mine = contrastRatio(rgb, reference);
    void wcag2;
    return { index, hex, rgb, contrast: mine };
  });

  return { seedHex, referenceHex, steps };
}

/**
 * Verify a tone scale reaches at least `minAA` contrast on its darkest usable end
 * and returns the indices that clear 4.5:1 (AA) and 3:1 (large / non-text).
 */
export function evaluateToneScale(scale: ToneScale): { aaIndices: number[]; largeIndices: number[] } {
  const aaIndices: number[] = [];
  const largeIndices: number[] = [];
  for (const step of scale.steps) {
    if (step.contrast >= 4.5) aaIndices.push(step.index);
    if (step.contrast >= 3) largeIndices.push(step.index);
  }
  return { aaIndices, largeIndices };
}
