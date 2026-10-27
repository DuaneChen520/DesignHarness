import type { ButtonRootProps } from '@designharness/primitives';
import { Button as ButtonPrimitive } from '@designharness/primitives';
import { type ForwardedRef, type ReactNode, forwardRef } from 'react';
import { cx, element, modifier } from './internal/classnames.js';

/**
 * Styled `Button`.
 *
 * The primitive owns behaviour and every accessibility signal (`type`, `disabled`,
 * `aria-disabled`, `aria-busy`, `aria-pressed`, `data-*`); this wrapper only adds the
 * `dh-button` class hooks that `styles/button.css` consumes, plus the two elements the
 * styled layer renders for the loading state. No ARIA attribute is read, rewritten or
 * defaulted here, and no inline style is produced.
 */

/** Visual variants sanctioned by DESIGN.md ("Components") — no more, no fewer. */
export const BUTTON_VARIANTS = ['primary', 'secondary', 'danger', 'outline', 'icon'] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

/** Control heights, mapped onto `--control-height-sm|md|lg` (DESIGN: 36px minimum hit area). */
export const BUTTON_SIZES = ['sm', 'md', 'lg'] as const;
export type ButtonSize = (typeof BUTTON_SIZES)[number];

/** Block class for every button selector in `styles/button.css`. */
export const BUTTON_BLOCK = 'dh-button';

export type UIButtonProps = ButtonRootProps & {
  /** Visual variant. @default "primary" */
  variant?: ButtonVariant | undefined;
  /** Height/padding step. @default "md" */
  size?: ButtonSize | undefined;
  /** Stretch the control to its container's inline size. */
  fullWidth?: boolean | undefined;
};

/**
 * Class list for a button. Exported so stories, tests and the registry metadata can
 * assert the prop → class mapping without rendering.
 */
export function buttonClassNames(props: {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  fullWidth?: boolean | undefined;
  loading?: boolean | undefined;
  className?: string | undefined;
}): string {
  const { variant = 'primary', size = 'md', fullWidth = false, loading = false, className } = props;
  return cx(
    BUTTON_BLOCK,
    modifier(BUTTON_BLOCK, variant),
    modifier(BUTTON_BLOCK, size),
    fullWidth ? modifier(BUTTON_BLOCK, 'full-width') : undefined,
    loading ? modifier(BUTTON_BLOCK, 'loading') : undefined,
    className,
  );
}

/** Headless-primitive button with the Meridian token styling applied. */
export const ButtonRoot = forwardRef<HTMLButtonElement, UIButtonProps>(function ButtonRoot(props, ref: ForwardedRef<HTMLButtonElement>) {
  const { variant, size, fullWidth = false, loading = false, children, className, ...restProps } = props;

  return (
    <ButtonPrimitive.Root
      {...restProps}
      ref={ref}
      loading={loading}
      className={buttonClassNames({ variant, size, fullWidth, loading, className })}
    >
      {loading ? <span className={element(BUTTON_BLOCK, 'spinner')} aria-hidden="true" /> : null}
      <span className={element(BUTTON_BLOCK, 'label')}>{children}</span>
    </ButtonPrimitive.Root>
  );
});

/** Callable component that also keeps the primitive's compound shape (`Button.Root`). */
export interface ButtonComponent {
  (props: UIButtonProps): ReactNode;
  Root: typeof ButtonRoot;
}

/** Explicit alias so every aggregate implementation shares the `UI*` naming (`UIButton` === `ButtonRoot`). */
export const UIButton: typeof ButtonRoot = ButtonRoot;

export const Button: ButtonComponent = Object.assign(ButtonRoot, { Root: ButtonRoot });
