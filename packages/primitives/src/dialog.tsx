import type { Api as DialogApi, Props as DialogMachinePropsRaw } from '@zag-js/dialog';
import type { PropTypes } from '@zag-js/react';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import { connect, machine } from '@zag-js/dialog';
import { usePresence } from '@ark-ui/react';
import { normalizeProps, useMachine } from '@zag-js/react';
import { useId, useCallback, useEffect } from 'react';
import { dialogAnatomy } from './internal/anatomy.js';
import { syncInertWithAriaHidden } from './internal/inert.js';
import { createPartContext, renderPartChildren } from './internal/context.js';
import type { PartChildren } from './internal/context.js';
import { dataAttr, splitProps } from './internal/props.js';

/** Props owned by the `@zag-js/dialog` machine. */
export type DialogMachineProps = DialogMachinePropsRaw;

/** The machine API surface, typed for this package. */
export type DialogApiValue = DialogApi<PropTypes>;

type RootDivElementProps = Omit<ComponentPropsWithRef<'div'>, 'children' | 'defaultValue' | 'onChange' | 'open' | 'id'>;

export interface DialogOwnProps {
  /** Do not mount the dialog content until it is first opened. */
  lazyMount?: boolean;
  /** Unmount the dialog content once the closing animation finishes. */
  unmountOnExit?: boolean;
  /** Keep the content mounted even when closed (overrides `lazyMount`/`unmountOnExit`). */
  forceMount?: boolean;
  children: PartChildren<{ open: boolean; api: DialogApiValue }>;
}

export type DialogRootProps = DialogMachineProps & DialogOwnProps & RootDivElementProps;

interface DialogContextValue {
  api: DialogApiValue;
  setNodeRef: (node: HTMLElement | null) => void;
  presenceProps: () => { 'data-state': string | undefined; hidden: boolean };
  mounted: boolean;
}

const { Provider, useContext: useDialogContext } = createPartContext<DialogContextValue>('Dialog');

const MACHINE_KEYS = [
  'ids',
  'trapFocus',
  'preventScroll',
  'modal',
  'initialFocusEl',
  'finalFocusEl',
  'restoreFocus',
  'closeOnInteractOutside',
  'closeOnEscape',
  'aria-label',
  'role',
  'open',
  'defaultOpen',
  'onOpenChange',
  'triggerValue',
  'defaultTriggerValue',
  'onTriggerValueChange',
  'dir',
  'getRootNode',
  'id',
  'onInteractOutside',
  'onFocusOutside',
  'onPointerDownOutside',
  'onEscapeKeyDown',
  'onRequestDismiss',
  'persistentElements',
] as const;

const OWN_KEYS = ['lazyMount', 'unmountOnExit', 'forceMount', 'children'] as const;

/**
 * Headless modal/non-modal dialog driving the `@zag-js/dialog` state machine.
 *
 * Focus moves into the dialog on open, is trapped while open (`trapFocus`, default for
 * modal dialogs) and returns to the trigger on close. `Escape` closes (unless
 * `closeOnEscape={false}` for destructive dialogs), backdrop clicks close (unless
 * `closeOnInteractOutside={false}`). `role="dialog"`/`alertdialog`, `aria-modal`,
 * `aria-labelledby` (Title) and `aria-describedby` (Body) are owned by the machine.
 *
 * Mount/unmount is presence-driven, so the styled layer can animate enter and exit.
 *
 * Emits `data-scope="dialog"` and the frozen dialog anatomy: `root`, `trigger`,
 * `backdrop`, `positioner`, `content`, `header`, `title`, `body`, `closeTrigger`.
 */
export function DialogRoot(props: DialogRootProps): ReactNode {
  const generatedId = useId();
  const [machineSide, withoutMachine] = splitProps(props, MACHINE_KEYS);
  const [own, domProps] = splitProps(withoutMachine, OWN_KEYS);
  const machineProps = machineSide as DialogMachineProps;
  const lazyMount = own.lazyMount ?? false;
  const unmountOnExit = own.unmountOnExit ?? true;
  const forceMount = own.forceMount ?? false;
  const children = own.children;

  const service = useMachine(machine, { ...machineProps, id: machineProps.id ?? generatedId });
  const api = connect(service, normalizeProps);
  const presence = usePresence({ present: api.open, lazyMount, unmountOnExit, skipAnimationOnMount: true });

  /**
   * Zag 1.46 hides a modal dialog's background with `aria-hidden` only, which leaves that
   * content focusable — a WCAG 2.2 SC 4.1.2 breach (axe `aria-hidden-focus`) and a real keyboard
   * hazard. Mirror the machine's markers onto `inert` for exactly as long as the modal is open.
   */
  const isModalOpen = api.open && machineProps.modal !== false;
  useEffect(() => {
    if (!isModalOpen) return undefined;
    return syncInertWithAriaHidden();
  }, [isModalOpen]);

  // Plain `??` locals instead of destructuring defaults, and no manual memo around the
  // context object: the React Compiler rules treat the machine connection and
  // default-destructured props as mutable, so such a memo could never be preserved.
  const context: DialogContextValue = {
    api,
    setNodeRef: presence.ref,
    presenceProps: presence.getPresenceProps,
    mounted: forceMount || !presence.unmounted,
  };

  const rootProps = {
    ...domProps,
    ...dialogAnatomy.root.attrs,
    'data-ownedby': service.scope.id,
    'data-state': api.open ? ('open' as const) : ('closed' as const),
  };

  return (
    <Provider value={context}>
      <div {...rootProps}>
        {renderPartChildren(children, { open: api.open, api })}
      </div>
    </Provider>
  );
}

export interface DialogTriggerProps extends Omit<ComponentPropsWithRef<'button'>, 'type'> {
  /** Identifies this trigger when several triggers open the same dialog. */
  value?: string;
}

/** Button that opens the dialog; owns `aria-expanded`, `aria-haspopup`, `aria-controls`. */
export function DialogTrigger(props: DialogTriggerProps): ReactNode {
  const { api } = useDialogContext();
  const { value, ...restProps } = props;
  const triggerProps = {
    ...api.getTriggerProps({ value }),
    ...restProps,
    ...dialogAnatomy.trigger.attrs,
  };
  return <button {...triggerProps} />;
}

/** Scrim behind the dialog. Hidden while closed so it never intercepts pointer events. */
export function DialogBackdrop(props: ComponentPropsWithRef<'div'>): ReactNode {
  const { api } = useDialogContext();
  const backdropProps = {
    ...api.getBackdropProps(),
    ...props,
    ...dialogAnatomy.backdrop.attrs,
    'data-ownedby': undefined,
  };
  return <div {...backdropProps} />;
}

/** Centring/floating wrapper for the dialog content. */
export function DialogPositioner(props: ComponentPropsWithRef<'div'>): ReactNode {
  const { api } = useDialogContext();
  const positionerProps = {
    ...api.getPositionerProps(),
    ...props,
    ...dialogAnatomy.positioner.attrs,
  };
  return <div {...positionerProps} />;
}

export type DialogContentProps = ComponentPropsWithRef<'div'>;

/**
 * The dialog surface: `role="dialog"`, `aria-modal`, `aria-labelledby` (from `Title`) and
 * `aria-describedby` (from `Body`) all come from the machine. This is the element the
 * focus trap and the dismissable layer are attached to, and the element whose
 * mount/unmount is presence-driven.
 */
export function DialogContent(props: DialogContentProps): ReactNode {
  const { api, setNodeRef, presenceProps, mounted } = useDialogContext();
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
    ...dialogAnatomy.content.attrs,
    ref: composedRef,
    'data-open': dataAttr(api.open),
    'data-closed': dataAttr(!api.open),
  };
  return <div {...contentProps} />;
}

/** Optional visual grouping row for the title and close trigger. */
export function DialogHeader(props: ComponentPropsWithRef<'div'>): ReactNode {
  const headerProps = { ...props, ...dialogAnatomy.header.attrs };
  return <div {...headerProps} />;
}

export interface DialogTitleProps extends Omit<ComponentPropsWithRef<'h2'>, 'children'> {
  /** Heading level rendered for the title. */
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  children: ReactNode;
}

/**
 * The dialog title. The machine points the dialog's `aria-labelledby` at it, so every
 * dialog needs one (or an explicit `aria-label` on `Root`).
 */
export function DialogTitle(props: DialogTitleProps): ReactNode {
  const { api } = useDialogContext();
  const { level = 2, children, ...restProps } = props;
  const Heading = `h${level}` as const;
  const titleProps = {
    ...api.getTitleProps(),
    ...restProps,
    ...dialogAnatomy.title.attrs,
  };
  return <Heading {...titleProps}>{children}</Heading>;
}

/**
 * The scrollable body of the dialog. The machine registers it as the dialog's
 * description, so `aria-describedby` on `Content` points here.
 */
export function DialogBody(props: ComponentPropsWithRef<'div'>): ReactNode {
  const { api } = useDialogContext();
  const bodyProps = {
    ...api.getDescriptionProps(),
    ...props,
    ...dialogAnatomy.body.attrs,
  };
  return <div {...bodyProps} />;
}

/** Button that closes the dialog and restores focus to the trigger. */
export function DialogCloseTrigger(props: ComponentPropsWithRef<'button'>): ReactNode {
  const { api } = useDialogContext();
  const closeProps = {
    ...api.getCloseTriggerProps(),
    ...props,
    ...dialogAnatomy.closeTrigger.attrs,
    'aria-label': props['aria-label'] ?? 'Close',
  };
  return <button {...closeProps} />;
}

export interface DialogNamespace {
  Root: typeof DialogRoot;
  Trigger: typeof DialogTrigger;
  Backdrop: typeof DialogBackdrop;
  Positioner: typeof DialogPositioner;
  Content: typeof DialogContent;
  Header: typeof DialogHeader;
  Title: typeof DialogTitle;
  Body: typeof DialogBody;
  CloseTrigger: typeof DialogCloseTrigger;
}

/** Compound namespace mirroring the frozen `dialog` anatomy. */
export const Dialog: DialogNamespace = {
  Root: DialogRoot,
  Trigger: DialogTrigger,
  Backdrop: DialogBackdrop,
  Positioner: DialogPositioner,
  Content: DialogContent,
  Header: DialogHeader,
  Title: DialogTitle,
  Body: DialogBody,
  CloseTrigger: DialogCloseTrigger,
};
