/**
 * Class-name helpers for the styled layer.
 *
 * The styled layer's only DOM contribution is *class names*: every structural and
 * state signal (`data-scope`, `data-part`, `data-open`, `data-disabled`, `aria-*`)
 * is owned by `@designharness/primitives` and is never re-implemented, renamed or
 * overridden here (TOKEN-API.md §5). Component CSS is authored against those
 * attributes plus the `dh-<component>` block / `dh-<component>--<variant>` modifier
 * classes produced by these helpers.
 */

/** Any value that a class list may legitimately contain. */
export type ClassValue = string | false | null | undefined;

/** Join a class list, dropping empty entries and collapsing to a single string. */
export function cx(...values: readonly ClassValue[]): string {
  const parts: string[] = [];
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) parts.push(value);
  }
  return parts.join(' ');
}

/**
 * BEM-ish modifier builder: `modifier('dh-button', 'primary')` → `dh-button--primary`.
 * A `false`/`undefined` modifier yields `undefined` so it can be passed to `cx` directly.
 */
export function modifier(block: string, value: string | false | null | undefined): string | undefined {
  if (!value) return undefined;
  return `${block}--${value}`;
}

/**
 * Element builder: `element('dh-button', 'spinner')` → `dh-button__spinner`.
 * Elements are markup *the styled layer itself renders* — never anatomy parts.
 */
export function element(block: string, name: string): string {
  return `${block}__${name}`;
}

/**
 * Merge a consumer `className` after the styled-layer classes so a host app can add
 * utility classes without ever losing the tokenized base (source order, no `!important`).
 */
export function withConsumerClass(styled: string, className: ClassValue): string {
  return cx(styled, className);
}
