import type {
  Api as ComboboxApi,
  ItemState as ComboboxItemState,
  Props as ComboboxMachinePropsRaw,
} from '@zag-js/combobox';
import type { PropTypes } from '@zag-js/react';
import type {
  CSSProperties,
  ComponentPropsWithRef,
  MouseEvent,
  MouseEventHandler,
  ReactNode,
  Ref,
} from 'react';
import { collection, connect, machine } from '@zag-js/combobox';
import { usePresence } from '@ark-ui/react';
import { normalizeProps, useMachine } from '@zag-js/react';
import { useId, useCallback, useState } from 'react';
import { comboboxAnatomy } from './internal/anatomy.js';
import { createPartContext, renderPartChildren } from './internal/context.js';
import type { PartChildren } from './internal/context.js';
import { dataAttr, splitProps } from './internal/props.js';

/** The minimal item shape the combobox reads. Richer objects are welcome. */
export interface ComboboxOptionItem {
  value: string;
  label: string;
  disabled?: boolean | undefined;
}

/** Collection type produced by the Zag combobox collection factory (`@zag-js/collection` is not a direct dependency). */
export type ComboboxCollection<T extends ComboboxOptionItem> = NonNullable<ComboboxMachinePropsRaw<T>['collection']>;

/** Per-option state, mirrored from the machine. */
export type ComboboxOptionState = ComboboxItemState;

/** The machine API, re-typed for this package's item shape. */
export type ComboboxApiValue<T extends ComboboxOptionItem> = ComboboxApi<PropTypes, T>;

/** Props owned by the `@zag-js/combobox` machine (everything except `collection`). */
export type ComboboxMachineProps<T extends ComboboxOptionItem> = Omit<ComboboxMachinePropsRaw<T>, 'collection'>;

/** Extra `<div>` attributes the root element accepts (aria-*, data-*, ref, …). */
type RootDivElementProps = Omit<ComponentPropsWithRef<'div'>, 'children' | 'value' | 'defaultValue' | 'onChange'>;

/** Snapshot handed to `Combobox.Root`'s render-prop children. */
export interface ComboboxRenderState<T extends ComboboxOptionItem> {
  open: boolean;
  inputValue: string;
  value: string[];
  selectedItems: T[];
  api: ComboboxApiValue<T>;
}

export interface ComboboxOwnProps<T extends ComboboxOptionItem> {
  /** The full option list; the Root filters it with `filter` while the user types. */
  items?: readonly T[];
  /** Pre-built collection (grouped or async data); takes precedence over `items`. */
  collection?: ComboboxCollection<T>;
  /** Predicate applied to `items` for the current query. Defaults to a label/value `includes` match. */
  filter?: ((item: T, query: string) => boolean) | undefined;
  /** Do not mount the listbox until it is first opened. */
  lazyMount?: boolean;
  /** Unmount the listbox once the closing animation finishes. */
  unmountOnExit?: boolean;
  /** Class name hook for the styled layer. */
  className?: string;
  /** Inline style hook; carries no design tokens by default. */
  style?: CSSProperties;
  children: PartChildren<ComboboxRenderState<T>>;
}

export type ComboboxRootProps<T extends ComboboxOptionItem> = ComboboxMachineProps<T> &
  ComboboxOwnProps<T> &
  RootDivElementProps;

interface ComboboxContextValue {
  api: ComboboxApiValue<ComboboxOptionItem>;
  /** The filtered items currently in the collection. */
  items: readonly ComboboxOptionItem[];
  setNodeRef: (node: HTMLElement | null) => void;
  presenceProps: () => { 'data-state': string | undefined; hidden: boolean };
  mounted: boolean;
}

const { Provider, useContext: useComboboxContext } = createPartContext<ComboboxContextValue>('Combobox');

const MACHINE_KEYS = [
  'open',
  'defaultOpen',
  'ids',
  'name',
  'form',
  'disabled',
  'readOnly',
  'invalid',
  'required',
  'placeholder',
  'defaultHighlightedValue',
  'highlightedValue',
  'value',
  'defaultValue',
  'defaultInputValue',
  'inputValue',
  'inputBehavior',
  'selectionBehavior',
  'autoFocus',
  'openOnClick',
  'openOnChange',
  'allowCustomValue',
  'alwaysSubmitOnEnter',
  'loopFocus',
  'positioning',
  'onInputValueChange',
  'onValueChange',
  'onHighlightChange',
  'onSelect',
  'onOpenChange',
  'translations',
  'multiple',
  'closeOnSelect',
  'openOnKeyPress',
  'scrollToIndexFn',
  'composite',
  'disableLayer',
  'navigate',
  'dir',
  'getRootNode',
  'id',
  'onInteractOutside',
  'onFocusOutside',
  'onPointerDownOutside',
] as const;

const OWN_KEYS = [
  'items',
  'collection',
  'filter',
  'lazyMount',
  'unmountOnExit',
  'className',
  'style',
  'children',
] as const;

const defaultFilter = (item: ComboboxOptionItem, query: string): boolean => {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;
  return item.label.toLowerCase().includes(needle) || item.value.toLowerCase().includes(needle);
};

/**
 * Headless combobox driving the `@zag-js/combobox` state machine and the WAI-ARIA APG
 * combobox pattern:
 *
 * - `ArrowDown`/`ArrowUp` move the active option (wrapping through `loopFocus`),
 *   `Home`/`End` jump to first/last, `Enter` commits the active option and closes,
 *   `Escape` closes and restores the typed value, typing filters the collection.
 * - the `<input>` keeps focus and owns `role="combobox"`, `aria-expanded`,
 *   `aria-controls` and `aria-activedescendant`.
 * - the listbox exposes `aria-multiselectable` when `multiple` is set.
 *
 * Controlled and uncontrolled state both work (`value`/`defaultValue`,
 * `inputValue`/`defaultInputValue`, `open`/`defaultOpen`).
 *
 * Emits `data-scope="combobox"` and the frozen combobox anatomy: `root`, `label`,
 * `control`, `trigger`, `input`, `clear`, `positioner`, `content`, `list`, `option`.
 */
export function ComboboxRoot<T extends ComboboxOptionItem>(props: ComboboxRootProps<T>): ReactNode {
  const generatedId = useId();
  const [machineSide, withoutMachine] = splitProps(props, MACHINE_KEYS);
  const [own, domProps] = splitProps(withoutMachine, OWN_KEYS);
  const machineProps = machineSide as Partial<ComboboxMachineProps<T>>;
  const ownProps = own as ComboboxOwnProps<T>;
  // Plain `??` locals rather than destructuring defaults: the React Compiler rules in
  // `react-hooks/preserve-manual-memoization` treat default-valued destructured
  // bindings as mutable and refuse to preserve the memos below.
  const allItems = ownProps.items ?? [];
  const collectionProp = ownProps.collection;
  const filter = ownProps.filter ?? defaultFilter;
  const lazyMount = ownProps.lazyMount ?? false;
  const unmountOnExit = ownProps.unmountOnExit ?? false;
  const className = ownProps.className;
  const style = ownProps.style;
  const children = ownProps.children;

  const [uncontrolledQuery, setUncontrolledQuery] = useState<string>(() => {
    if (machineProps.inputValue != null) return machineProps.inputValue;
    if (machineProps.defaultInputValue != null && machineProps.defaultInputValue.length > 0) {
      return machineProps.defaultInputValue;
    }
    const values = machineProps.value ?? machineProps.defaultValue ?? [];
    if (!machineProps.multiple && values.length > 0) {
      return allItems
        .filter((item) => values.includes(item.value))
        .map((item) => item.label)
        .join(', ');
    }
    return '';
  });
  const query = machineProps.inputValue ?? uncontrolledQuery;

  // Derived during render (no manual `useMemo`): the React Compiler rules refuse to
  // preserve memoization whose dependencies come from the props object, and Zag's
  // `machine.watch` tracks the collection by content hash, so a freshly built
  // collection with unchanged items never re-triggers the machine.
  const filteredItems = allItems.filter((item) => filter(item, query));

  const resolvedCollection: ComboboxCollection<T> =
    collectionProp ??
    collection<T>({
      items: filteredItems,
      itemToValue: (item) => item.value,
      itemToString: (item) => item.label,
      isItemDisabled: (item) => item.disabled === true,
    });

  const service = useMachine(machine, {
    ...machineProps,
    id: machineProps.id ?? generatedId,
    collection: resolvedCollection,
    onInputValueChange: (details) => {
      setUncontrolledQuery(details.inputValue);
      machineProps.onInputValueChange?.(details);
    },
  });

  const api = connect(service, normalizeProps) as unknown as ComboboxApiValue<T>;
  const presence = usePresence({ present: api.open, lazyMount, unmountOnExit, skipAnimationOnMount: true });

  // Not memoized: the machine connection and presence object are treated as mutable by
  // the React Compiler rules, so a manual memo here could never be preserved. Parts
  // re-render with the Root, which only happens on machine events anyway.
  const context: ComboboxContextValue = {
    api: api as unknown as ComboboxApiValue<ComboboxOptionItem>,
    items: filteredItems as readonly ComboboxOptionItem[],
    setNodeRef: presence.ref,
    presenceProps: presence.getPresenceProps,
    mounted: !presence.unmounted,
  };

  const { ref, ...restDomProps } = domProps;
  const rootProps = {
    ...api.getRootProps(),
    ...restDomProps,
    ...comboboxAnatomy.root.attrs,
    className,
    style,
    ref,
    'data-open': dataAttr(api.open),
    'data-closed': dataAttr(!api.open),
    'data-disabled': dataAttr(api.disabled),
  };

  return (
    <Provider value={context}>
      <div {...rootProps}>
        {renderPartChildren(children, {
          open: api.open,
          inputValue: api.inputValue,
          value: api.value,
          selectedItems: api.selectedItems,
          api,
        })}
      </div>
    </Provider>
  );
}

/** `<label>` bound to the combobox input. Placeholder text is never a label. */
export function ComboboxLabel(props: Omit<ComponentPropsWithRef<'label'>, 'htmlFor'>): ReactNode {
  const { api } = useComboboxContext();
  const labelProps = {
    ...api.getLabelProps(),
    ...props,
    ...comboboxAnatomy.label.attrs,
  };
  // `htmlFor` is passed explicitly (not only through the machine spread) so the
  // association is statically checkable by the lint sensors.
  return <label {...labelProps} htmlFor={api.getLabelProps().htmlFor} />;
}

/** Wrapper that groups the input with the trigger and clear buttons. */
export function ComboboxControl(props: ComponentPropsWithRef<'div'>): ReactNode {
  const { api } = useComboboxContext();
  const controlProps = {
    ...api.getControlProps(),
    ...props,
    ...comboboxAnatomy.control.attrs,
    'data-open': dataAttr(api.open),
  };
  return <div {...controlProps} />;
}

/**
 * The `<input role="combobox">`. It keeps focus while the listbox is open and owns
 * `aria-expanded`, `aria-controls`, `aria-activedescendant`, `aria-invalid` and
 * `aria-required`.
 */
export function ComboboxInput(props: ComponentPropsWithRef<'input'>): ReactNode {
  const { api } = useComboboxContext();
  const inputProps = {
    ...api.getInputProps(),
    ...props,
    ...comboboxAnatomy.input.attrs,
    'data-open': dataAttr(api.open),
  };
  return <input {...inputProps} />;
}

export interface ComboboxTriggerProps extends Omit<ComponentPropsWithRef<'button'>, 'type'> {
  /** Make the trigger reachable with Tab in addition to the input. */
  focusable?: boolean;
}

/** Disclosure trigger: `aria-expanded`/`aria-controls` come from the machine. */
export function ComboboxTrigger(props: ComboboxTriggerProps): ReactNode {
  const { api } = useComboboxContext();
  const { focusable, ...restProps } = props;
  const machineProps = api.getTriggerProps({ focusable });
  const triggerProps = {
    ...machineProps,
    ...restProps,
    ...comboboxAnatomy.trigger.attrs,
    onClick: (event: MouseEvent<HTMLButtonElement>): void => {
      restProps.onClick?.(event);
      (machineProps.onClick as MouseEventHandler<HTMLElement> | undefined)?.(event);
    },
  };
  return <button {...triggerProps} />;
}

/**
 * Clear button. The frozen contract names this part `clear` (Zag's anatomy calls it
 * `clearTrigger`); the machine owns the reset behaviour.
 */
export function ComboboxClear(props: ComponentPropsWithRef<'button'>): ReactNode {
  const { api } = useComboboxContext();
  const machineProps = api.getClearTriggerProps();
  const clearProps = {
    ...machineProps,
    ...props,
    ...comboboxAnatomy.clear.attrs,
    'aria-label': props['aria-label'] ?? 'Clear selection',
  };
  return <button {...clearProps} />;
}

/** Positioning wrapper (popper anchor) for the floating listbox. */
export function ComboboxPositioner(props: ComponentPropsWithRef<'div'>): ReactNode {
  const { api } = useComboboxContext();
  const positionerProps = {
    ...api.getPositionerProps(),
    ...props,
    ...comboboxAnatomy.positioner.attrs,
  };
  return <div {...positionerProps} />;
}

/**
 * The floating listbox surface. Mount/unmount is presence-driven so the styled layer can
 * animate it; the element stays mounted-but-hidden unless `lazyMount`/`unmountOnExit`
 * opt out.
 */
export function ComboboxContent(props: ComponentPropsWithRef<'div'>): ReactNode {
  const { api, setNodeRef, presenceProps, mounted } = useComboboxContext();
  const { ref, ...restProps } = props;
  const composedRef = useCallback(
    (node: HTMLDivElement | null): void => {
      setNodeRef(node);
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref != null) {
        ref.current = node;
      }
    },
    [setNodeRef, ref],
  );
  if (!mounted) return null;
  const contentProps = {
    ...api.getContentProps(),
    ...presenceProps(),
    ...restProps,
    ...comboboxAnatomy.content.attrs,
    'data-empty': dataAttr(api.collection.size === 0),
    ref: composedRef,
  };
  return <div {...contentProps} />;
}

export interface ComboboxListProps extends Omit<ComponentPropsWithRef<'ul'>, 'children'> {
  children?: PartChildren<readonly ComboboxOptionItem[]>;
}

/**
 * The option container. It renders every filtered option when no children are given, or
 * delegates to `children(items)` for grouped/virtualised markup. `role="presentation"`
 * keeps the listbox flat for assistive technology.
 */
export function ComboboxList(props: ComboboxListProps): ReactNode {
  const { api, items } = useComboboxContext();
  const { children, ...restProps } = props;
  const listProps = {
    ...api.getListProps(),
    ...restProps,
    ...comboboxAnatomy.list.attrs,
    role: 'presentation' as const,
    /**
     * `@zag-js/combobox` also puts the label reference on the list. A `role="presentation"`
     * element that carries an accessible name is put *back* into the accessibility tree by
     * the ARIA rule (and axe-core's `aria-required-children` / `aria-required-parent` follow
     * it), which re-parents every `role="option"` under a nameless `<ul>` and breaks the
     * listbox's owned-children chain. The `content` part already carries the label, so the
     * presentation part must not: the flat listbox the comment above promises needs this.
     */
    'aria-labelledby': undefined,
    'data-empty': dataAttr(items.length === 0),
  };
  return (
    <ul {...listProps}>
      {children === undefined
        ? items.map((item) => (
            <ComboboxOption key={item.value} item={item}>
              {item.label}
            </ComboboxOption>
          ))
        : renderPartChildren(children, items)}
    </ul>
  );
}

export interface ComboboxOptionProps<T extends ComboboxOptionItem>
  extends Omit<ComponentPropsWithRef<'li'>, 'children'> {
  /** The item this option renders. */
  item: T;
  /** Keep the highlighted state when the pointer leaves the option. */
  persistFocus?: boolean;
  children?: PartChildren<{ item: T; state: ComboboxOptionState }>;
  ref?: Ref<HTMLLIElement>;
}

/**
 * `<li role="option">` with `aria-selected`, `aria-disabled`, `data-highlighted` and the
 * machine's pointer/keyboard wiring. The frozen contract names this part `option`
 * (Zag's anatomy calls it `item`).
 */
export function ComboboxOption<T extends ComboboxOptionItem>(props: ComboboxOptionProps<T>): ReactNode {
  const { api } = useComboboxContext();
  const { item, persistFocus, children, ref, ...restProps } = props;
  const optionItem: ComboboxOptionItem = item;
  const state = api.getItemState({ item: optionItem });
  const machineProps = api.getItemProps({ item: optionItem });
  const optionProps = {
    ...machineProps,
    ...restProps,
    ...comboboxAnatomy.option.attrs,
    onClick: (event: MouseEvent<HTMLLIElement>): void => {
      restProps.onClick?.(event);
      (machineProps.onClick as MouseEventHandler<HTMLElement> | undefined)?.(event);
    },
    // `persistFocus` keeps the machine's highlight when the pointer leaves the option:
    // skipping the machine's own `onMouseLeave` (unselect) is how Ark expresses this.
    onMouseLeave: (event: MouseEvent<HTMLLIElement>): void => {
      restProps.onMouseLeave?.(event);
      if (!persistFocus) {
        (machineProps.onMouseLeave as MouseEventHandler<HTMLElement> | undefined)?.(event);
      }
    },
  };
  return (
    <li {...optionProps} ref={ref}>
      {children === undefined ? item.label : renderPartChildren(children, { item, state })}
    </li>
  );
}

export interface ComboboxNamespace {
  Root: typeof ComboboxRoot;
  Label: typeof ComboboxLabel;
  Control: typeof ComboboxControl;
  Input: typeof ComboboxInput;
  Trigger: typeof ComboboxTrigger;
  Clear: typeof ComboboxClear;
  Positioner: typeof ComboboxPositioner;
  Content: typeof ComboboxContent;
  List: typeof ComboboxList;
  Option: typeof ComboboxOption;
}

/** Compound namespace mirroring the frozen `combobox` anatomy. */
export const Combobox: ComboboxNamespace = {
  Root: ComboboxRoot,
  Label: ComboboxLabel,
  Control: ComboboxControl,
  Input: ComboboxInput,
  Trigger: ComboboxTrigger,
  Clear: ComboboxClear,
  Positioner: ComboboxPositioner,
  Content: ComboboxContent,
  List: ComboboxList,
  Option: ComboboxOption,
};
