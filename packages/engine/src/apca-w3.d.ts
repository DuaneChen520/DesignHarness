/**
 * Ambient typings for the `apca-w3` package (Myndex APCA contrast predictor).
 *
 * The published package is ESM but ships no `.d.ts` and no `exports` map, so
 * under `moduleResolution: NodeNext` TypeScript cannot infer its shape. These
 * declarations cover exactly the functions the harness consumes. APCA is a
 * diagnostic-only channel — see `colors/apca.ts`.
 */
declare module 'apca-w3' {
  /**
   * APCA lightness contrast (Lc). Takes linear-Y luminance (0–1) for the text and
   * the background. Polarity matters: (text, apca). Returns a signed number; 0 on
   * out-of-range input.
   */
  export function APCAcontrast(textY: number, backgroundY: number, places?: number): number;

  /**
   * Luminance (soft-clamped Y) from an sRGB 8-bit channel triple in 0–255.
   */
  export function sRGBtoY(rgb: readonly [number, number, number]): number;

  /** Convenience: parse two CSS/hex colours and return signed Lc. */
  export function calcAPCA(textColor: string, bgColor: string, places?: number, roundResult?: boolean): number;
}
