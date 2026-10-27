/** Visual size of the button. */
export type ButtonSize = 'sm' | 'md' | 'lg';

/** Button display variant. */
export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export interface ButtonProps {
  /** Text label rendered inside the button. */
  label: string;
  /** Visual variant. */
  variant?: ButtonVariant;
  /** Control size. */
  size?: ButtonSize;
  /** Disable interaction. */
  disabled?: boolean;
  /** Arbitrary content placed before the label. */
  icon?: string;
  /** Legacy fixed width in pixels.
   * @deprecated use {@link size} instead.
   */
  width?: number;
  /** Fired when the button is clicked. */
  onClick?: (event: 'pointer') => void;
  /** Fired when the button receives focus. */
  onFocus?: () => void;
}

/** A primary action button. */
export function Button({ label, size = 'md' }: ButtonProps): string {
  return `${label}:${size}`;
}

Button.defaultProps = { variant: 'primary', disabled: true };
