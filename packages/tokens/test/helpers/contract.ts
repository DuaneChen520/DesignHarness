/**
 * The frozen interoperability list of TOKEN-API.md §3, transcribed as data so the
 * contract test can assert the *whole* list instead of sampling it.
 *
 * `--font-weight-*`, `--line-height-*` and `--letter-spacing-*` are documented as
 * "same leaf names as `--font-size-*`". Weight and line height are declared for all
 * ten type styles in DESIGN.md; letter spacing is declared for four of them, and the
 * harness does not fabricate the missing six — that subset is spelled out here.
 */

/** The 29 semantic colour roles (`--color-<role>`), in §3 order. */
export const SEMANTIC_COLOR_ROLES: readonly string[] = [
  'canvas',
  'surface',
  'surface-sunken',
  'surface-raised',
  'scrim',
  'overlay',
  'text-primary',
  'text-secondary',
  'text-inverse',
  'primary',
  'primary-hover',
  'primary-pressed',
  'primary-subtle',
  'on-primary',
  'on-primary-subtle',
  'border-subtle',
  'border-strong',
  'border-selected',
  'focus',
  'success',
  'success-subtle',
  'on-success-subtle',
  'warning',
  'warning-subtle',
  'on-warning-subtle',
  'danger',
  'danger-subtle',
  'on-danger',
  'on-danger-subtle',
];

/** Space scale (`--space-*`), including the 0.25rem grid scalar. */
export const SPACE_NAMES: readonly string[] = [
  'space-xxs', 'space-xs', 'space-sm', 'space-md',
  'space-lg', 'space-xl', 'space-xxl', 'space-xxxl', 'space-base',
];

/** Radius scale. */
export const RADIUS_NAMES: readonly string[] = ['radius-xs', 'radius-sm', 'radius-md', 'radius-lg', 'radius-xl', 'radius-full'];

/** Type leaves, shared by size / weight / line-height / letter-spacing. */
export const TYPE_LEAVES: readonly string[] = [
  'display-lg', 'heading-1', 'heading-2', 'heading-3',
  'body-lg', 'body-md', 'body-sm', 'label-caps', 'numeric-md', 'numeric-lg',
];

/** Type styles DESIGN.md gives explicit tracking to (the rest have no authored value). */
export const TRACKED_TYPE_LEAVES: readonly string[] = ['display-lg', 'heading-1', 'heading-2', 'label-caps'];

export const FONT_FAMILY_NAMES: readonly string[] = ['font-family-body', 'font-family-display', 'font-family-mono'];
export const BORDER_WIDTH_NAMES: readonly string[] = ['border-width-hairline', 'border-width-strong'];
export const DURATION_NAMES: readonly string[] = ['duration-instant', 'duration-fast', 'duration-moderate', 'duration-slow'];
export const EASING_NAMES: readonly string[] = ['easing-standard', 'easing-exit', 'easing-entry'];
export const ELEVATION_NAMES: readonly string[] = ['elevation-0', 'elevation-1', 'elevation-2'];
export const CONTROL_NAMES: readonly string[] = ['control-height-sm', 'control-height-md', 'control-height-lg', 'target-size-min'];

/** Component tier dimensions, exactly as §3 lists them. */
export const COMPONENT_DIMENSION_NAMES: readonly string[] = [
  'button-height',
  'button-padding-inline',
  'button-radius',
  'input-height',
  'input-padding-inline',
  'dialog-radius',
  'dialog-padding',
  'dialog-max-width-sm',
  'dialog-max-width-md',
  'dialog-max-width-lg',
  'table-header-height',
  'table-row-height-standard',
  'table-row-height-compact',
  'table-row-height-comfortable',
  'table-cell-padding-inline',
];

/**
 * Names the artifact emits that §3 does not enumerate. Every entry must be justified:
 * anything else appearing in the output is a contract break.
 *
 * - `input-radius`: DESIGN.md `components.input.rounded = {rounded.sm}`, so the tier
 *   exists in the intent file; §3's component bullet simply forgot it.
 * - the `color.component.*` tier (`--color-button-primary-background`, …) and the
 *   `--color-primitive-*` set, both explicitly allowed by the §3 preamble.
 */
export const ALLOWED_EXTRAS: readonly string[] = ['input-radius'];

/** The complete §3 list, as public names without the `--` prefix. */
export const CONTRACT_NAMES: readonly string[] = [
  ...SEMANTIC_COLOR_ROLES.map((role) => `color-${role}`),
  ...SPACE_NAMES,
  ...RADIUS_NAMES,
  ...FONT_FAMILY_NAMES,
  ...TYPE_LEAVES.map((leaf) => `font-size-${leaf}`),
  ...TYPE_LEAVES.map((leaf) => `font-weight-${leaf}`),
  ...TYPE_LEAVES.map((leaf) => `line-height-${leaf}`),
  ...TRACKED_TYPE_LEAVES.map((leaf) => `letter-spacing-${leaf}`),
  ...BORDER_WIDTH_NAMES,
  ...DURATION_NAMES,
  ...EASING_NAMES,
  ...ELEVATION_NAMES,
  ...CONTROL_NAMES,
  ...COMPONENT_DIMENSION_NAMES,
];

/** Cascade selectors the generated `index.css` must contain (TOKEN-API §3). */
export const CASCADE_RULES: readonly { readonly selector: string; readonly mode: string }[] = [
  { selector: ':root, [data-theme="light"]', mode: 'light' },
  { selector: '[data-theme="dark"]', mode: 'dark' },
  { selector: '[data-theme="high-contrast"]', mode: 'high-contrast' },
  { selector: '[data-theme="high-contrast-dark"]', mode: 'high-contrast-dark' },
  { selector: ':root:not([data-theme="light"])', mode: 'dark' },
];

/** Single-mode stylesheet per mode, as emitted under `dist/css/`. */
export const MODE_STYLESHEETS: readonly { readonly mode: string; readonly file: string }[] = [
  { mode: 'light', file: 'dist/css/light.css' },
  { mode: 'dark', file: 'dist/css/dark.css' },
  { mode: 'high-contrast', file: 'dist/css/high-contrast.css' },
  { mode: 'high-contrast-dark', file: 'dist/css/high-contrast-dark.css' },
];
