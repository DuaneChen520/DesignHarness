/**
 * Real colour mathematics per CSS Color Module Level 4 and WCAG 2.x.
 *
 * Nothing here is an approximation table: sRGB gamma, the linear-sRGB ↔ OKLab
 * transform (Björn Ottosson's matrices), the OKLab ↔ OKLCH polar conversion, WCAG
 * relative luminance / contrast ratio and sRGB gamut mapping by chroma reduction
 * are all implemented analytically. The two cone-response matrices below are the
 * published CSS Color 4 constants; their inverses are derived numerically so the
 * forward and reverse pipelines are guaranteed to be exact inverses of each other.
 *
 * @see https://www.w3.org/TR/css-color-4/
 * @see https://www.w3.org/TR/WCAG22/#contrast-minimum
 */
import type { LinearRgb, Oklab, Oklch, Rgb } from './primitives.js';

/**
 * Linear-light sRGB → LMS (Ottosson cone response). Rows sum to ~1 so
 * linear white maps to LMS white.
 */
const M1: readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]] = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995466, 0.1073969566],
  [0.0886414964, 0.2817188376, 0.6299787005],
];

/** LMS^(1/3) → OKLab. */
const M2: readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]] = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
];

/** sRGB relative-luminance coefficients (WCAG 2.x, ITU-R BT.709 primaries). */
const LUMA: readonly [number, number, number] = [0.2126, 0.7152, 0.0722];

/** A 3×3 matrix as a fixed tuple so indexed access is fully typed. */
type Mat3 = readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]];

/** Invert a 3×3 matrix via the adjugate / determinant method. */
function invert3(m: Mat3): Mat3 {
  const [a, b, c] = m[0];
  const [d, e, f] = m[1];
  const [g, h, i] = m[2];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const id = 1 / det;
  // Adjugate = transpose of the cofactor matrix.
  return [
    [A * id, -(b * i - c * h) * id, (b * f - c * e) * id],
    [B * id, (a * i - c * g) * id, -(a * f - c * d) * id],
    [C * id, -(a * h - b * g) * id, (a * e - b * d) * id],
  ] as const;
}

const M1_INV = invert3(M1);
const M2_INV = invert3(M2);

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** sRGB transfer-function companding (gamma expansion) of one 0–255 channel → 0–1 linear. */
export function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Inverse sRGB transfer function: one 0–1 linear channel → 0–255 sRGB. */
export function linearToSrgb(linear: number): number {
  const c = linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
  return clamp(c, 0, 1) * 255;
}

/**
 * Parse a `#RGB`, `#RGBA`, `#RRGGBB` or `#RRGGBBAA` hex string into an sRGB
 * integer triple. Throws on malformed input (fail fast at the boundary; the
 * linter guarantees valid hex upstream).
 */
export function hexToRgb(hex: string): Rgb {
  let s = hex.trim();
  if (s.startsWith('#')) s = s.slice(1);
  if (s.length === 3 || s.length === 4) {
    s = s
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  if (s.length !== 6 && s.length !== 8) {
    throw new TypeError(`Invalid hex colour: "${hex}"`);
  }
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) {
    throw new TypeError(`Invalid hex colour: "${hex}"`);
  }
  return [r, g, b] as Rgb;
}

/** Render an sRGB triple to an uppercase `#RRGGBB` string. Channels are rounded & clamped. */
export function rgbToHex(rgb: Rgb): string {
  const parts = rgb.map((ch) => Math.round(clamp(ch, 0, 255)).toString(16).padStart(2, '0'));
  return ('#' + parts.join('')).toUpperCase();
}

/** WCAG 2.x relative luminance of an sRGB colour (0–1). */
export function relativeLuminance(rgb: Rgb): number {
  const r = srgbToLinear(rgb[0]!);
  const g = srgbToLinear(rgb[1]!);
  const b = srgbToLinear(rgb[2]!);
  return LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
}

/** Relative luminance directly from linear-light sRGB (no gamma round-trip). */
export function luminanceFromLinear(linear: LinearRgb): number {
  return LUMA[0] * linear[0]! + LUMA[1] * linear[1]! + LUMA[2] * linear[2]!;
}

/** WCAG 2.x contrast ratio between two sRGB colours (1–21). Order-independent. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Contrast ratio from two hex strings — convenience for diagnostics. */
export function contrastRatioHex(aHex: string, bHex: string): number {
  return contrastRatio(hexToRgb(aHex), hexToRgb(bHex));
}

/** Convert sRGB → OKLab. */
export function srgbToOklab(rgb: Rgb): Oklab {
  const r = srgbToLinear(rgb[0]!);
  const g = srgbToLinear(rgb[1]!);
  const b = srgbToLinear(rgb[2]!);
  const l = Math.cbrt(M1[0][0]! * r + M1[0][1]! * g + M1[0][2]! * b);
  const m = Math.cbrt(M1[1][0]! * r + M1[1][1]! * g + M1[1][2]! * b);
  const s = Math.cbrt(M1[2][0]! * r + M1[2][1]! * g + M1[2][2]! * b);
  const L = M2[0][0]! * l + M2[0][1]! * m + M2[0][2]! * s;
  const A = M2[1][0]! * l + M2[1][1]! * m + M2[1][2]! * s;
  const B = M2[2][0]! * l + M2[2][1]! * m + M2[2][2]! * s;
  return [L, A, B] as Oklab;
}

/** Convert OKLab → linear-light sRGB (may be out of [0,1] when out of gamut). */
export function oklabToLinearRgb(lab: Oklab): LinearRgb {
  const [L, a, b] = lab;
  const l_ = M2_INV[0][0]! * L! + M2_INV[0][1]! * a! + M2_INV[0][2]! * b!;
  const m_ = M2_INV[1][0]! * L! + M2_INV[1][1]! * a! + M2_INV[1][2]! * b!;
  const s_ = M2_INV[2][0]! * L! + M2_INV[2][1]! * a! + M2_INV[2][2]! * b!;
  const l = l_! * l_! * l_!;
  const m = m_! * m_! * m_!;
  const s = s_! * s_! * s_!;
  const r = M1_INV[0][0]! * l + M1_INV[0][1]! * m + M1_INV[0][2]! * s;
  const g = M1_INV[1][0]! * l + M1_INV[1][1]! * m + M1_INV[1][2]! * s;
  const bb = M1_INV[2][0]! * l + M1_INV[2][1]! * m + M1_INV[2][2]! * s;
  return [r, g, bb] as LinearRgb;
}

/** Convert linear-light sRGB → OKLab. */
export function linearRgbToOklab(linear: LinearRgb): Oklab {
  const l = Math.cbrt(M1[0][0]! * linear[0]! + M1[0][1]! * linear[1]! + M1[0][2]! * linear[2]!);
  const m = Math.cbrt(M1[1][0]! * linear[0]! + M1[1][1]! * linear[1]! + M1[1][2]! * linear[2]!);
  const s = Math.cbrt(M1[2][0]! * linear[0]! + M1[2][1]! * linear[1]! + M1[2][2]! * linear[2]!);
  const L = M2[0][0]! * l + M2[0][1]! * m + M2[0][2]! * s;
  const A = M2[1][0]! * l + M2[1][1]! * m + M2[1][2]! * s;
  const B = M2[2][0]! * l + M2[2][1]! * m + M2[2][2]! * s;
  return [L, A, B] as Oklab;
}

/** Convert OKLab → sRGB 0–255, clamping to the sRGB cube (hard clip). */
export function oklabToSrgb(lab: Oklab): Rgb {
  const linear = oklabToLinearRgb(lab);
  return [
    Math.round(linearToSrgb(clamp(linear[0]!, 0, 1))),
    Math.round(linearToSrgb(clamp(linear[1]!, 0, 1))),
    Math.round(linearToSrgb(clamp(linear[2]!, 0, 1))),
  ] as Rgb;
}

/** Convert sRGB → OKLCH (polar OKLab). */
export function oklabToOklch(lab: Oklab): Oklch {
  const [, a, b] = lab;
  const C = Math.sqrt(a! * a! + b! * b!);
  let H = (Math.atan2(b!, a!) * 180) / Math.PI;
  if (H < 0) H += 360;
  // Achromatic colours have undefined hue; normalise to 0 for determinism.
  return [lab[0]!, C < 1e-9 ? 0 : C, C < 1e-9 ? 0 : H] as Oklch;
}

/** Convert OKLCH → OKLab. */
export function oklchToOklab(oklch: Oklch): Oklab {
  const [L, C, H] = oklch;
  const h = ((H ?? 0) * Math.PI) / 180;
  return [L!, C! * Math.cos(h), C! * Math.sin(h)] as Oklab;
}

/** Convert sRGB → OKLCH. */
export function srgbToOklch(rgb: Rgb): Oklch {
  return oklabToOklch(srgbToOklab(rgb));
}

/** Whether an OKLCH colour lies inside the sRGB gamut (with a small epsilon). */
export function isOklchInSrgbGamut(oklch: Oklch, epsilon = 1e-4): boolean {
  const linear = oklabToLinearRgb(oklchToOklab(oklch));
  return linear.every((ch) => ch! >= -epsilon && ch! <= 1 + epsilon);
}

/**
 * Gamut-map an OKLCH colour into sRGB by reducing chroma (CSS Color 4 "chroma
 * reduction" method), preserving lightness and hue. Falls back to a hard clip if
 * even zero chroma is out of gamut (should not happen for L in [0,1]).
 */
export function mapOklchToSrgbGamut(oklch: Oklch): Rgb {
  const [L, C, H] = oklch;
  if (isOklchInSrgbGamut(oklch)) {
    return oklabToSrgb(oklchToOklab(oklch));
  }
  let lo = 0;
  let hi = C!;
  let best = oklabToSrgb(oklchToOklab([L, 0, H] as Oklch));
  for (let i = 0; i < 32; i += 1) {
    const mid = (lo + hi) / 2;
    const candidate = [L, mid, H] as Oklch;
    if (isOklchInSrgbGamut(candidate)) {
      best = oklabToSrgb(oklchToOklab(candidate));
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return best;
}

/** Convert OKLCH → sRGB with hard clipping only (no chroma reduction). */
export function oklchToSrgb(oklch: Oklch): Rgb {
  return oklabToSrgb(oklchToOklab(oklch));
}

const round = (v: number, places: number): number => {
  const f = Math.pow(10, places);
  return Math.round(v * f) / f;
};

/**
 * Serialise an OKLCH triple to a CSS `oklch(L C H)` string with fixed precision.
 * Deterministic so artifact regeneration is byte-stable.
 */
export function formatOklch(oklch: Oklch, precision = 5): string {
  const [L, C, H] = oklch;
  return `oklch(${round(L!, precision)} ${round(C!, precision)} ${round(H!, precision)})`;
}

/**
 * Parse a CSS `oklch(L C H [ / A])` string. Supports the modern space-separated
 * syntax produced by {@link formatOklch}. Returns an {@link Oklch} triple plus an
 * optional alpha 0–1.
 */
export function parseOklch(input: string): { oklch: Oklch; alpha?: number } {
  const match = /oklch\(\s*([^)\s]+)\s+([^)\s]+)\s+([^)\s/]+)(?:\s*\/\s*([^)\s]+))?\s*\)/i.exec(input.trim());
  if (!match) {
    throw new TypeError(`Invalid oklch() colour: "${input}"`);
  }
  const L = Number(match[1]);
  const C = Number(match[2]);
  const H = match[3]!.endsWith('deg') ? Number(match[3]!.slice(0, -3)) : Number(match[3]);
  if ([L, C, H].some((n) => Number.isNaN(n))) {
    throw new TypeError(`Invalid oklch() colour: "${input}"`);
  }
  const alpha = match[4] !== undefined ? Number(match[4]) : undefined;
  return { oklch: [L, C, H] as Oklch, alpha: alpha !== undefined && !Number.isNaN(alpha) ? alpha : undefined };
}

/** Convert a hex colour to its canonical `oklch(...)` CSS string. */
export function hexToOklchString(hex: string, precision = 5): string {
  return formatOklch(srgbToOklch(hexToRgb(hex)), precision);
}

/** Convert an `oklch(...)` CSS string back to a hex colour (gamut-mapped). */
export function oklchStringToHex(oklchString: string): string {
  const { oklch } = parseOklch(oklchString);
  return rgbToHex(mapOklchToSrgbGamut(oklch));
}
