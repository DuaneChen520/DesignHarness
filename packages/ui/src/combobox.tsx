import type {
  ComboboxCollection,
  ComboboxOptionItem,
  ComboboxRootProps,
  ComboboxTriggerProps,
} from '@designharness/primitives';
import { Combobox as ComboboxPrimitive } from '@designharness/primitives';
import type { ComponentPropsWithRef, CSSProperties, ReactNode } from 'react';
import { cx, element, modifier } from './internal/classnames.js';

/**
 * Styled `Combobox`, async-search friendly.
 *
 * Keyboard behaviour and every ARIA attribute (`role="combobox"` on the input,
 * `aria-expanded`, `aria-controls`, `aria-activedescendant`, the `role="listbox"`
 * surface and the `role="option"` items) are owned by the `@zag-js/combobox` machine
 * behind the primitive. This layer contributes classes, the disclosure/clear glyphs and
 * the loading + empty rows the machine has no markup for.
 */

/** Block class for every combobox selector in `styles/combobox.css`. */
export const COMBOBOX_BLOCK = 'dh-combobox';

/** Props of the faithful styled `combobox` anatomy root (same names as the primitive). */
export type UIComboboxRootProps<T extends ComboboxOptionItem> = ComboboxRootProps<T> & {
  className?: string | undefined;
};

/** Anatomy root: context provider only, exactly like `Combobox.Root` in the primitives. */
export function ComboboxRoot<T extends ComboboxOptionItem>(props: UIComboboxRootProps<T>): ReactNode {
  const { className, style, children, ...restProps } = props;
  return (
    <ComboboxPrimitive.Root
      {...restProps}
      className={cx(COMBOBOX_BLOCK, className)}
      style={style}
    >
      {children}
    </ComboboxPrimitive.Root>
  );
}

export type UIComboboxProps<T extends ComboboxOptionItem> = Omit<
  ComboboxRootProps<T>,
  'children' | 'items' | 'collection' | 'filter' | 'className' | 'style'
> & {
  /** Option list. For async sources, hand in the current page of results. */
  items?: readonly T[] | undefined;
  /** Pre-built collection (grouped or server-driven); takes precedence over `items`. */
  collection?: ComboboxCollection<T> | undefined;
  /**
   * Local predicate over `items`. Async consumers that already filtered server-side
   * should pass `() => true` so nothing is hidden twice.
   */
  filter?: ((item: T, query: string) => boolean) | undefined;
  /** Visible label. A combobox without a label is a DESIGN.md prohibition. */
  label?: ReactNode | undefined;
  /** Render the clear button when a value is selected. @default true */
  clearable?: boolean | undefined;
  /** Async request in flight: shows the loading row and spins the disclosure glyph. */
  loading?: boolean | undefined;
  /** Copy for the loading row. @default "Searching…" */
  loadingText?: ReactNode | undefined;
  /** Copy for the no-match row. @default "No matches found" */
  emptyText?: ReactNode | undefined;
  /** Custom option content; defaults to `item.label`. */
  renderOption?: ((item: T) => ReactNode) | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  children?: ReactNode | undefined;
};

export type UIComboboxTriggerProps = ComboboxTriggerProps & {
  /** Spin the disclosure glyph in place of the chevron. */
  loading?: boolean | undefined;
};

/** Native button props accepted by the clear trigger (the machine owns `type`). */
export type UIComboboxClearProps = Omit<ComponentPropsWithRef<'button'>, 'type'>;

/** Disclosure trigger with the styled layer's glyph. `aria-expanded` stays machine-owned. */
export function ComboboxTrigger(props: UIComboboxTriggerProps): ReactNode {
  const { children, className, loading = false, ...restProps } = props;
  return (
    <ComboboxPrimitive.Trigger {...restProps} className={cx(element(COMBOBOX_BLOCK, 'trigger'), className)}>
      {children ??
        (loading ? (
          <span className={element(COMBOBOX_BLOCK, 'spinner')} aria-hidden="true" />
        ) : (
          <span className={element(COMBOBOX_BLOCK, 'chevron')} aria-hidden="true" />
        ))}
    </ComboboxPrimitive.Trigger>
  );
}

/** Clear button with the styled layer's glyph. Its accessible name comes from the machine. */
export function ComboboxClear(props: UIComboboxClearProps): ReactNode {
  const { children, className, ...restProps } = props;
  return (
    <ComboboxPrimitive.Clear {...restProps} className={cx(element(COMBOBOX_BLOCK, 'clear'), className)}>
      {children ?? <span className={element(COMBOBOX_BLOCK, 'clear-glyph')} aria-hidden="true">×</span>}
    </ComboboxPrimitive.Clear>
  );
}

/**
 * The whole field: label, control (input + trigger + clear) and the floating listbox.
 * Controlled and uncontrolled props keep the primitive's names (`value`/`defaultValue`,
 * `inputValue`/`defaultInputValue`, `open`/`defaultOpen`, `onValueChange`,
 * `onInputValueChange`, `onOpenChange`).
 */
export function UICombobox<T extends ComboboxOptionItem>(props: UIComboboxProps<T>): ReactNode {
  const {
    items,
    collection,
    filter,
    label,
    clearable = true,
    loading = false,
    loadingText = 'Searching…',
    emptyText = 'No matches found',
    renderOption,
    className,
    style,
    children,
    ...restProps
  } = props;

  return (
    <ComboboxRoot
      {...restProps}
      items={items}
      collection={collection}
      filter={filter}
      className={cx(loading ? modifier(COMBOBOX_BLOCK, 'loading') : undefined, className)}
      style={style}
    >
      {(state) => (
        <>
          {label !== undefined && label !== null ? <ComboboxPrimitive.Label>{label}</ComboboxPrimitive.Label> : null}
          <ComboboxPrimitive.Control>
            <ComboboxPrimitive.Input />
            <ComboboxTrigger loading={loading} />
            {clearable && state.value.length > 0 ? <ComboboxClear /> : null}
          </ComboboxPrimitive.Control>
          <ComboboxPrimitive.Positioner>
            <ComboboxPrimitive.Content>
              {loading ? (
                /**
                 * A `role="listbox"` must own at least one `role="option"` (WCAG 2.2 SC 1.3.1 /
                 * 4.1.2, which axe-core enforces as `aria-required-children` + `aria-required-parent`).
                 * "Searching…" is therefore an owned but `aria-disabled` option — the APG-compatible way
                 * to say "this list has nothing you can take yet" without breaking the pattern, and the
                 * machine never highlights or commits it.
                 */
                <div className={element(COMBOBOX_BLOCK, 'loading')} role="option" aria-selected="false" aria-disabled="true">
                  {loadingText}
                </div>
              ) : null}
              <ComboboxPrimitive.List>
                {(listItems) =>
                  listItems.length === 0 ? (
                    <li className={element(COMBOBOX_BLOCK, 'empty')} role="option" aria-selected="false" aria-disabled="true">
                      {emptyText}
                    </li>
                  ) : (
                    listItems.map((item) => (
                      // The machine's filtered list holds the very objects handed in through
                      // `items: readonly T[]`, so re-widening to `T` is identity-preserving.
                      <ComboboxPrimitive.Option key={item.value} item={item as T}>
                        {renderOption !== undefined ? renderOption(item as T) : item.label}
                      </ComboboxPrimitive.Option>
                    ))
                  )
                }
              </ComboboxPrimitive.List>
            </ComboboxPrimitive.Content>
          </ComboboxPrimitive.Positioner>
          {children}
        </>
      )}
    </ComboboxRoot>
  );
}

/** Callable async combobox plus the frozen compound parts. */
export interface ComboboxComponent {
  <T extends ComboboxOptionItem>(props: UIComboboxProps<T>): ReactNode;
  Root: typeof ComboboxRoot;
  Label: typeof ComboboxPrimitive.Label;
  Control: typeof ComboboxPrimitive.Control;
  Input: typeof ComboboxPrimitive.Input;
  Trigger: typeof ComboboxTrigger;
  Clear: typeof ComboboxClear;
  Positioner: typeof ComboboxPrimitive.Positioner;
  Content: typeof ComboboxPrimitive.Content;
  List: typeof ComboboxPrimitive.List;
  Option: typeof ComboboxPrimitive.Option;
}

export const Combobox: ComboboxComponent = Object.assign(UICombobox, {
  Root: ComboboxRoot,
  Label: ComboboxPrimitive.Label,
  Control: ComboboxPrimitive.Control,
  Input: ComboboxPrimitive.Input,
  Trigger: ComboboxTrigger,
  Clear: ComboboxClear,
  Positioner: ComboboxPrimitive.Positioner,
  Content: ComboboxPrimitive.Content,
  List: ComboboxPrimitive.List,
  Option: ComboboxPrimitive.Option,
});
