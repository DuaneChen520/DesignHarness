/**
 * Harness system-layer defaults.
 *
 * DESIGN.md is the Intent SSOT for brand colours, type, spacing and radius, but it
 * is deliberately silent on a small set of *structural* system tokens (motion
 * durations/easings, elevation shadows, control heights, minimum target size,
 * border widths and the few component dimensions the spec never pins). Those are
 * defined here as first-principles harness defaults, each traced to RESEARCH.md
 * (the engineering authority), and expressed as plain numbers / unit strings —
 * never colour literals — so the Tier-1 colour gate stays green.
 *
 * @see RESEARCH.md §6.1 (grid & relative units), §6.2 (motion + elevation), §3.2 (DTCG)
 */

/** Space base scalar: the 0.25rem grid root (RESEARCH §6.1; TOKEN-API §3). */
export const SPACE_BASE = '0.25rem';

/** Hairline + strong border widths (TOKEN-API §3). */
export const BORDER_WIDTH = { hairline: '0.0625rem', strong: '0.125rem' } as const;

/** Motion durations (RESEARCH §6.2: micro 100–150, expand 200–250, modal 300–400). */
export const DURATIONS = {
  instant: '0ms',
  fast: '150ms',
  moderate: '250ms',
  slow: '400ms',
} as const;

/** Easing curves (RESEARCH §6.2). cubicBezier control-point quadruples. */
export const EASING = {
  standard: [0.2, 0, 0, 1],
  exit: [0.4, 0, 1, 1],
  entry: [0, 0, 0.2, 1],
} as const;

/** Control heights (px). md = 36px is the DESIGN button height (§5 of TOKEN-API). */
export const CONTROL_HEIGHT = { sm: '32px', md: '36px', lg: '40px' } as const;

/** WCAG 2.2 SC 2.5.8 minimum interactive target (24px). */
export const TARGET_SIZE_MIN = '24px';

/**
 * Elevation geometry (offsetX offsetY blur spread in px) — RESEARCH §6.1: three
 * elevations only. Shadow colour is injected at build time from the DESIGN `overlay`
 * primitive (converted to OKLCH with a per-level alpha), never a hard-coded literal.
 */
export const ELEVATION_GEOMETRY = {
  '1': { offsetX: '0px', offsetY: '2px', blur: '4px', spread: '-1px', alpha: 0.16 },
  '2': { offsetX: '0px', offsetY: '12px', blur: '32px', spread: '-4px', alpha: 0.28 },
} as const;

/** Table density ladder — DESIGN.md "Components"/Layout: 32 / 40 / 56 px rows. */
export const TABLE_ROW_HEIGHTS = { compact: '32px', standard: '40px', comfortable: '56px' } as const;

/** Dialog max-width ladder — harness defaults (DESIGN silent), rem for fluidity. */
export const DIALOG_MAX_WIDTH = { sm: '24rem', md: '36rem', lg: '48rem' } as const;
