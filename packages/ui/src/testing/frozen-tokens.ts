/**
 * The frozen CSS custom-property surface of `@designharness/tokens`.
 *
 * This list is a transcription of `packages/tokens/TOKEN-API.md` §3 — the authoritative
 * cross-package contract. It is duplicated here on purpose: the unit test that consumes it
 * (`test/token-coverage.test.ts`) must be able to catch styled-layer drift *before* the
 * token build lands, so it cannot read the build's own output.
 *
 * Where §3 states a pattern (`--font-weight-*`, `--line-height-*`, `--letter-spacing-*`
 * "same leaf names as `--font-size-*`"), the pattern is expanded here to exactly the leaves
 * DESIGN.md's `typography` block declares. `letter-spacing` is the narrow one: DESIGN.md
 * declares tracking for four styles only, so the other six names are not part of the set.
 *
 * Nothing outside this list may be referenced by any authored CSS file in this package.
 */

/** The ten declared type styles of the Meridian scale. */
export const TYPE_SCALE_LEAVES = [
  'display-lg',
  'heading-1',
  'heading-2',
  'heading-3',
  'body-lg',
  'body-md',
  'body-sm',
  'label-caps',
  'numeric-md',
  'numeric-lg',
] as const;

/** Leaves that carry a declared `letterSpacing` in DESIGN.md. */
export const LETTER_SPACING_LEAVES = ['display-lg', 'heading-1', 'heading-2', 'label-caps'] as const;

const color = (name: string): string => `--color-${name}`;

const typeFamily = ['--font-family-body', '--font-family-display', '--font-family-mono'] as const;

const sized = (prefix: string, leaves: readonly string[]): string[] => leaves.map((leaf) => `${prefix}-${leaf}`);

/** Every custom property name the styled layer is allowed to consume, `--` prefixed. */
export const FROZEN_TOKEN_NAMES: readonly string[] = [
  // §3 Surfaces
  color('canvas'),
  color('surface'),
  color('surface-sunken'),
  color('surface-raised'),
  color('scrim'),
  color('overlay'),
  // §3 Text
  color('text-primary'),
  color('text-secondary'),
  color('text-inverse'),
  // §3 Interaction
  color('primary'),
  color('primary-hover'),
  color('primary-pressed'),
  color('primary-subtle'),
  color('on-primary'),
  color('on-primary-subtle'),
  // §3 Borders / focus
  color('border-subtle'),
  color('border-strong'),
  color('border-selected'),
  color('focus'),
  // §3 States
  color('success'),
  color('success-subtle'),
  color('on-success-subtle'),
  color('warning'),
  color('warning-subtle'),
  color('on-warning-subtle'),
  color('danger'),
  color('danger-subtle'),
  color('on-danger'),
  color('on-danger-subtle'),
  // §3 Space
  '--space-xxs',
  '--space-xs',
  '--space-sm',
  '--space-md',
  '--space-lg',
  '--space-xl',
  '--space-xxl',
  '--space-xxxl',
  '--space-base',
  // §3 Radius
  '--radius-xs',
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
  '--radius-xl',
  '--radius-full',
  // §3 Type
  ...typeFamily,
  ...sized('--font-size', TYPE_SCALE_LEAVES),
  ...sized('--font-weight', TYPE_SCALE_LEAVES),
  ...sized('--line-height', TYPE_SCALE_LEAVES),
  ...sized('--letter-spacing', LETTER_SPACING_LEAVES),
  // §3 Border widths
  '--border-width-hairline',
  '--border-width-strong',
  // §3 Motion
  '--duration-instant',
  '--duration-fast',
  '--duration-moderate',
  '--duration-slow',
  '--easing-standard',
  '--easing-exit',
  '--easing-entry',
  // §3 Elevation
  '--elevation-0',
  '--elevation-1',
  '--elevation-2',
  // §3 Controls
  '--control-height-sm',
  '--control-height-md',
  '--control-height-lg',
  '--target-size-min',
  // §3 Component tier
  '--button-height',
  '--button-padding-inline',
  '--button-radius',
  '--input-height',
  '--input-padding-inline',
  '--dialog-radius',
  '--dialog-padding',
  '--dialog-max-width-sm',
  '--dialog-max-width-md',
  '--dialog-max-width-lg',
  '--table-header-height',
  '--table-row-height-standard',
  '--table-row-height-compact',
  '--table-row-height-comfortable',
  '--table-cell-padding-inline',
];

/** Frozen names as a set, for O(1) membership checks. */
export const FROZEN_TOKEN_SET: ReadonlySet<string> = new Set(FROZEN_TOKEN_NAMES);

/** `true` when `name` (with or without the leading `--`) is part of the frozen surface. */
export function isFrozenTokenName(name: string): boolean {
  return FROZEN_TOKEN_SET.has(name.startsWith('--') ? name : `--${name}`);
}
