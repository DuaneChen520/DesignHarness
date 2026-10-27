import type {
  DialogContentProps,
  DialogRootProps,
  DialogTitleProps,
  DialogTriggerProps,
} from '@designharness/primitives';
import { Dialog as DialogPrimitive } from '@designharness/primitives';
import { type ReactNode, forwardRef } from 'react';
import { cx, element, modifier } from './internal/classnames.js';

/**
 * Styled `Dialog`.
 *
 * `role="dialog"`/`alertdialog`, `aria-modal`, `aria-labelledby`, `aria-describedby`,
 * the focus trap, `Escape`/outside-click dismissal and the presence lifecycle all come
 * from the `@zag-js/dialog` machine behind the primitive. This layer sizes the surface,
 * lays it out with a container query and adds the footer element DESIGN.md asks for.
 */

/** Block class for every dialog selector in `styles/dialog.css`. */
export const DIALOG_BLOCK = 'dh-dialog';

/** Surface widths, mapped onto `--dialog-max-width-sm|md|lg`. */
export const DIALOG_SIZES = ['sm', 'md', 'lg'] as const;
export type DialogSize = (typeof DIALOG_SIZES)[number];

/** Anatomy root: context provider only, exactly like `Dialog.Root` in the primitives. */
export function DialogRoot(props: DialogRootProps): ReactNode {
  const { className, children, ...restProps } = props;
  return (
    <DialogPrimitive.Root {...restProps} className={cx(element(DIALOG_BLOCK, 'root'), className)}>
      {children}
    </DialogPrimitive.Root>
  );
}

export type UIDialogContentProps = DialogContentProps & {
  /** Surface width step. @default "md" */
  size?: DialogSize | undefined;
};

/** Class list for the dialog surface; exported so tests and stories can assert the mapping. */
export function dialogContentClassNames(size: DialogSize = 'md', className?: string | undefined): string {
  return cx(DIALOG_BLOCK, modifier(DIALOG_BLOCK, size), className);
}

/**
 * The dialog surface. `size` selects `--dialog-max-width-*` and the `@container`
 * breakpoint for the header/body/footer arrangement; `data-state`, `role` and the
 * labelled-by/described-by wiring stay machine-owned.
 */
export const DialogContent = forwardRef<HTMLDivElement, UIDialogContentProps>(function DialogContent(props, ref) {
  const { size, className, children, ...restProps } = props;
  return (
    <DialogPrimitive.Content {...restProps} ref={ref} className={dialogContentClassNames(size, className)}>
      {children}
    </DialogPrimitive.Content>
  );
});

/** Close trigger with the styled layer's glyph; `aria-label="Close"` comes from the primitive. */
export function DialogCloseTrigger(props: DialogTriggerProps): ReactNode {
  const { children, className, ...restProps } = props;
  return (
    <DialogPrimitive.CloseTrigger {...restProps} className={cx(element(DIALOG_BLOCK, 'close'), className)}>
      {children ?? <span className={element(DIALOG_BLOCK, 'close-glyph')} aria-hidden="true">×</span>}
    </DialogPrimitive.CloseTrigger>
  );
}

/** Heading wrapper so the title and the close trigger share one row. */
export function DialogTitle(props: DialogTitleProps): ReactNode {
  const { className, ...restProps } = props;
  return <DialogPrimitive.Title {...restProps} className={cx(element(DIALOG_BLOCK, 'title'), className)} />;
}

export type UIDialogProps = Omit<DialogRootProps, 'children' | 'className'> & {
  /** Dialog title. Required: an unnamed dialog is an accessibility defect, not a style. */
  title: ReactNode;
  /** Surface width step. @default "md" */
  size?: DialogSize | undefined;
  /** Footer content, right-aligned on wide surfaces (DESIGN.md: action row). */
  footer?: ReactNode | undefined;
  /** Trigger label. Omit it to drive the dialog with `open` instead. */
  trigger?: ReactNode | undefined;
  /** Props for the rendered trigger (e.g. `variant`-styled `Button`). */
  triggerProps?: DialogTriggerProps | undefined;
  /** Render the close trigger in the header. @default true */
  closable?: boolean | undefined;
  /** Body content. */
  children: ReactNode;
  className?: string | undefined;
};

const isPresent = (value: ReactNode): boolean => value !== undefined && value !== null && value !== false && value !== '';

/**
 * Complete dialog: trigger, backdrop, positioner, sized surface, header with close
 * trigger, body and an optional footer row.
 */
export function UIDialog(props: UIDialogProps): ReactNode {
  const { title, size = 'md', footer, trigger, triggerProps, closable = true, children, className, ...restProps } = props;

  return (
    <DialogRoot {...restProps} className={className}>
      {isPresent(trigger) ? <DialogPrimitive.Trigger {...triggerProps}>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Backdrop />
      <DialogPrimitive.Positioner>
        <DialogContent size={size}>
          <DialogPrimitive.Header className={element(DIALOG_BLOCK, 'header')}>
            <DialogTitle>{title}</DialogTitle>
            {closable ? <DialogCloseTrigger /> : null}
          </DialogPrimitive.Header>
          <DialogPrimitive.Body className={element(DIALOG_BLOCK, 'body')}>{children}</DialogPrimitive.Body>
          {isPresent(footer) ? <div className={element(DIALOG_BLOCK, 'footer')}>{footer}</div> : null}
        </DialogContent>
      </DialogPrimitive.Positioner>
    </DialogRoot>
  );
}

/** Callable dialog plus the frozen compound parts. */
export interface DialogComponent {
  (props: UIDialogProps): ReactNode;
  Root: typeof DialogRoot;
  Trigger: typeof DialogPrimitive.Trigger;
  Backdrop: typeof DialogPrimitive.Backdrop;
  Positioner: typeof DialogPrimitive.Positioner;
  Content: typeof DialogContent;
  Header: typeof DialogPrimitive.Header;
  Title: typeof DialogTitle;
  Body: typeof DialogPrimitive.Body;
  CloseTrigger: typeof DialogCloseTrigger;
}

export const Dialog: DialogComponent = Object.assign(UIDialog, {
  Root: DialogRoot,
  Trigger: DialogPrimitive.Trigger,
  Backdrop: DialogPrimitive.Backdrop,
  Positioner: DialogPrimitive.Positioner,
  Content: DialogContent,
  Header: DialogPrimitive.Header,
  Title: DialogTitle,
  Body: DialogPrimitive.Body,
  CloseTrigger: DialogCloseTrigger,
});
