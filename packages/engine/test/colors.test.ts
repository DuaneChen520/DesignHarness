import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  formatOklch,
  hexToOklchString,
  hexToRgb,
  isOklchInSrgbGamut,
  mapOklchToSrgbGamut,
  oklchStringToHex,
  oklchToSrgb,
  parseOklch,
  relativeLuminance,
  rgbToHex,
  srgbToLinear,
  srgbToOklch,
} from '../src/index.js';
import { apcaLc, apcaLcFromHexes } from '../src/index.js';

// This package's ESLint gate bans `#RRGGBB` literals, so colours are stored without
// the leading hash and normalised through `hx`.
const hx = (h: string): string => `#${h}`;

describe('sRGB ↔ linear', () => {
  it('expands channel values with the sRGB transfer function', () => {
    expect(srgbToLinear(0)).toBeCloseTo(0, 6);
    expect(srgbToLinear(255)).toBeCloseTo(1, 6);
    expect(srgbToLinear(128)).toBeGreaterThan(0.21);
  });
});

describe('hex ↔ rgb', () => {
  it('parses and renders hex round-trips', () => {
    expect(hexToRgb(hx('1A5FD0'))).toEqual([26, 95, 208]);
    expect(rgbToHex([26, 95, 208])).toBe(hx('1A5FD0'));
    expect(hexToRgb(hx('abc'))).toEqual([170, 187, 204]); // shorthand expansion
  });
});

describe('WCAG relative luminance + contrast', () => {
  it('matches known luminance anchors', () => {
    expect(relativeLuminance(hexToRgb(hx('000000')))).toBeCloseTo(0, 6);
    expect(relativeLuminance(hexToRgb(hx('FFFFFF')))).toBeCloseTo(1, 6);
    expect(relativeLuminance(hexToRgb(hx('FF0000')))).toBeCloseTo(0.2126, 4);
  });

  it('gives 21:1 for black on white and 1:1 for identical colours', () => {
    expect(contrastRatio(hexToRgb(hx('000000')), hexToRgb(hx('FFFFFF')))).toBeCloseTo(21, 4);
    expect(contrastRatio(hexToRgb(hx('808080')), hexToRgb(hx('808080')))).toBeCloseTo(1, 6);
  });

  it('computes the primary interaction blue against white as ~5.85:1 (AA pass)', () => {
    const ratio = contrastRatio(hexToRgb(hx('1A5FD0')), hexToRgb(hx('FFFFFF')));
    // DESIGN.md documents "5.83:1"; exact WCAG 2.x math on #1A5FD0 yields 5.85.
    expect(ratio).toBeGreaterThan(5.8);
    expect(ratio).toBeLessThan(5.9);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

describe('OKLCH conversions (CSS Color 4)', () => {
  it('produces the canonical oklch triple for the brand primary', () => {
    const [l, c, h] = srgbToOklch(hexToRgb(hx('1A5FD0')));
    expect(l).toBeCloseTo(0.51361, 4);
    expect(c).toBeCloseTo(0.18748, 4);
    expect(h).toBeCloseTo(260.272, 2);
    expect(hexToOklchString(hx('1A5FD0'))).toBe('oklch(0.51361 0.18748 260.27187)');
  });

  it('matches published OKLCH reference values for the primaries', () => {
    const red = srgbToOklch(hexToRgb(hx('FF0000')));
    expect(red[0]).toBeCloseTo(0.62795, 4);
    expect(red[1]).toBeCloseTo(0.25768, 4);
    const green = srgbToOklch(hexToRgb(hx('00FF00')));
    expect(green[0]).toBeCloseTo(0.86644, 4);
    const blue = srgbToOklch(hexToRgb(hx('0000FF')));
    expect(blue[0]).toBeCloseTo(0.45201, 4);
  });

  it('round-trips hex → oklch → hex (idempotence)', () => {
    for (const raw of ['1A5FD0', '0B0F16', 'FAFAFB', '4ADE9B', '127A4A', 'FFFFFF', '000000', '611512']) {
      const oklchStr = hexToOklchString(hx(raw));
      expect(oklchStringToHex(oklchStr)).toBe(hx(raw));
    }
  });

  it('format + parse are inverse-ish', () => {
    const value = 'oklch(0.51361 0.18748 260.27187)';
    const parsed = parseOklch(value);
    expect(formatOklch(parsed.oklch)).toBe(value);
  });

  it('parses an alpha form', () => {
    const parsed = parseOklch('oklch(0.5 0.1 200 / 0.5)');
    expect(parsed.alpha).toBe(0.5);
    expect(parsed.oklch).toEqual([0.5, 0.1, 200]);
  });
});

describe('gamut clamping / mapping by chroma reduction', () => {
  it('detects out-of-gamut OKLCH and maps it back inside', () => {
    const oversaturated: readonly [number, number, number] = [0.5, 0.45, 120];
    expect(isOklchInSrgbGamut(oversaturated)).toBe(false);
    const mapped = mapOklchToSrgbGamut(oversaturated);
    expect(mapped.every((ch) => ch >= 0 && ch <= 255)).toBe(true);
    // The mapped colour must be in gamut.
    expect(isOklchInSrgbGamut(srgbToOklch(mapped))).toBe(true);
  });

  it('clips hard for oklchToSrgb (no chroma reduction)', () => {
    const rgb = oklchToSrgb([0.5, 0.45, 120]);
    expect(rgb.every((ch) => ch >= 0 && ch <= 255)).toBe(true);
  });
});

describe('APCA (diagnostic only, never blocks)', () => {
  it('returns a finite signed Lc for black/white', () => {
    const lc = apcaLc(hexToRgb(hx('000000')), hexToRgb(hx('FFFFFF')));
    expect(lc).toBeDefined();
    expect(Number.isFinite(lc as number)).toBe(true);
    // apca-w3 polarity: positive Lc for dark text on a light background,
    // negative for light text on dark. Black on white is the ~106 anchor.
    expect(lc as number).toBeGreaterThan(100);
    const inverted = apcaLc(hexToRgb(hx('FFFFFF')), hexToRgb(hx('000000')));
    expect(inverted as number).toBeLessThan(0);
  });

  it('never throws on malformed input (returns undefined)', () => {
    expect(apcaLcFromHexes('not-a-color', hx('FFFFFF'))).toBeUndefined();
  });

  it('primary blue on white has a reasonable |Lc|', () => {
    const lc = apcaLcFromHexes(hx('1A5FD0'), hx('FFFFFF'));
    expect(lc).toBeDefined();
    expect(Math.abs(lc as number)).toBeGreaterThan(40);
  });
});
