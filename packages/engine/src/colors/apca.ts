/**
 * APCA (Lc) diagnostic channel.
 *
 * APCA is explicitly NOT a hard gate — WCAG 2.2 is the only blocking standard.
 * These helpers compute the signed Lc value for diagnostics/telemetry and are
 * written so they can never throw or block a build: any failure returns
 * `undefined` rather than propagating.
 *
 * @see https://github.com/Myndex/apca-w3
 */
import { APCAcontrast, sRGBtoY } from 'apca-w3';
import { hexToRgb } from './convert.js';
import type { Rgb } from './primitives.js';

/** Signed APCA Lc for two sRGB triples. Never throws: returns undefined on any error. */
export function apcaLc(text: Rgb, background: Rgb): number | undefined {
  try {
    const txtY = sRGBtoY([text[0]!, text[1]!, text[2]!]);
    const bgY = sRGBtoY([background[0]!, background[1]!, background[2]!]);
    const value = APCAcontrast(txtY, bgY, -1);
    return Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Signed APCA Lc from two hex strings. Never throws. */
export function apcaLcFromHexes(textHex: string, backgroundHex: string): number | undefined {
  try {
    return apcaLc(hexToRgb(textHex), hexToRgb(backgroundHex));
  } catch {
    return undefined;
  }
}

/**
 * A rough APCA "readability" note for large type diagnostics. Uses the widely
 * cited Lc ≥ 60 for body text / Lc ≥ 75 for comfortable reading as guidance, but
 * the caller must treat this as advisory only.
 */
export function apcaIsLikelyReadable(lc: number | undefined, threshold = 60): boolean | undefined {
  if (lc === undefined) return undefined;
  return Math.abs(lc) >= threshold;
}
