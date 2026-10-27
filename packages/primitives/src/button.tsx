import type { ComponentPropsWithRef, HTMLAttributes, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { connect, machine } from '@zag-js/toggle';
import { normalizeProps, useMachine } from '@zag-js/react';
import { forwardRef } from 'react';
import { buttonAnatomy } from './internal/anatomy.js';
import { ariaAttr, assertContract, dataAttr, splitProps } from './internal/props.js';

type ButtonElementProps = Omit<ComponentPropsWithRef<'button'>, 'type'>;
type MachineElementProps = Omit<HTMLAttributes<HTMLElement>, 'children'>;

/** Props that steer button behaviour, independent of the native `button` attributes. */
export interface ButtonBehaviorProps {
  /**
   * The native `type` attribute. Never rely on the implicit `submit` default.
   * @default "button"
   */
  type?: 'button' | 'submit' | 'reset' | undefined;
  /**
   * Async action in progress: sets `aria-busy`, disables the button and swallows activation.
   */
  loading?: boolean | undefined;
  /**
   * Toggle mode: the `@zag-js/toggle` state machine owns `aria-pressed` and `data-state`.
   */
  toggle?: boolean | undefined;
  /** Controlled pressed state — only meaningful with `toggle`. */
  pressed?: boolean | undefined;
  /** Uncontrolled initial pressed state — only meaningful with `toggle`. */
  defaultPressed?: boolean | undefined;
  /** Called whenever the toggle machine commits a new pressed state. */
  onPressedChange?: ((pressed: boolean) => void) | undefined;
  /**
   * Marks the button as icon-only. An accessible name becomes a hard requirement
   * (`aria-label` or `aria-labelledby`), enforced by the type and at runtime.
   */
  iconOnly?: boolean | undefined;
}

/**
 * `iconOnly` is a discriminated contract: when set, one of the naming attributes is
 * required.
 */
export type ButtonNameProps =
  | { iconOnly?: false | undefined }
  | { iconOnly: true; 'aria-label': string }
  | { iconOnly: true; 'aria-labelledby': string };

export type ButtonRootProps = ButtonElementProps & ButtonBehaviorProps & ButtonNameProps;

const BEHAVIOR_KEYS = [
  'type',
  'loading',
  'toggle',
  'pressed',
  'defaultPressed',
  'onPressedChange',
  'iconOnly',
] as const;

/** The frozen anatomy for `button` is `root` only, so the scope is re-labelled from Zag's `toggle`. */
const ROOT_ATTRS = buttonAnatomy.root.attrs;
const IDLE_PROPS: MachineElementProps = {};

/**
 * Headless button. It renders a real `<button>` element so that `Space`/`Enter` keep
 * their native activation semantics, and layers the contract attributes on top:
 *
 * - `toggle` runs the `@zag-js/toggle` machine, which owns `aria-pressed` and `data-state`.
 * - `loading` sets `aria-busy`, disables the control and swallows activation, so neither
 *   a consumer `onClick` nor the machine can fire.
 * - `disabled`/`loading` also emit `aria-disabled` — the state is never signalled by
 *   colour alone; the styled layer reads these attributes.
 *
 * Emits `data-scope="button"` + `data-part="root"` and no styling of any kind.
 */
export const ButtonRoot = forwardRef<HTMLButtonElement, ButtonRootProps>(function ButtonRoot(inProps, ref) {
  const [behavior, domProps] = splitProps(inProps, BEHAVIOR_KEYS);
  const { type = 'button', loading = false, toggle = false, iconOnly = false } = behavior;
  const disabled = inProps.disabled === true;
  const blocked = disabled || loading;

  assertContract(
    !iconOnly || inProps['aria-label'] != null || inProps['aria-labelledby'] != null,
    'Button: icon-only buttons require an accessible name via "aria-label" or "aria-labelledby".',
  );

  const service = useMachine(machine, {
    disabled: blocked,
    pressed: behavior.pressed,
    defaultPressed: behavior.defaultPressed ?? false,
    onPressedChange: behavior.onPressedChange,
  });
  const api = connect(service, normalizeProps);

  const { children, onClick, onKeyDown, ...restDomProps } = domProps;
  const machineProps: MachineElementProps = toggle ? api.getRootProps() : IDLE_PROPS;

  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    if (blocked) {
      // A blocked button never activates: neither the consumer handler nor the
      // machine sees the event.
      event.preventDefault();
      return;
    }
    onClick?.(event);
    machineProps.onClick?.(event);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (blocked) {
      event.preventDefault();
      return;
    }
    onKeyDown?.(event);
  };

  return (
    <button
      {...machineProps}
      {...restDomProps}
      {...ROOT_ATTRS}
      ref={ref}
      type={type}
      disabled={blocked}
      aria-disabled={ariaAttr(blocked)}
      aria-busy={ariaAttr(loading)}
      data-disabled={dataAttr(blocked)}
      data-loading={dataAttr(loading)}
      data-icon-only={dataAttr(iconOnly)}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {children as ReactNode}
    </button>
  );
});

export interface ButtonNamespace {
  Root: typeof ButtonRoot;
}

/** Compound namespace mirroring the frozen `button` anatomy (`button: root`). */
export const Button: ButtonNamespace = { Root: ButtonRoot };
