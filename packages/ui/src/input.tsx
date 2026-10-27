import type { InputInputProps, InputRootProps } from '@designharness/primitives';
import { Input as InputPrimitive } from '@designharness/primitives';
import { type ReactNode, forwardRef } from 'react';
import { cx, element } from './internal/classnames.js';
import { isPresent } from './internal/presence.js';

/**
 * Styled `Input` field.
 *
 * The primitive owns the whole accessibility story: label association (`htmlFor`),
 * `aria-required`, `aria-invalid`, the `aria-describedby` chain that joins the
 * description and the error text, and `role="alert"` on the error. This wrapper adds
 * classes and composition only — it never re-declares an `aria-*` attribute.
 */

/** Block class for every input selector in `styles/input.css`. */
export const INPUT_BLOCK = 'dh-input';

/** Modifier applied by the styled layer when the field carries an error message. */
export const INPUT_ERROR_MODIFIER = `${INPUT_BLOCK}--error`;

export type UIInputProps = InputRootProps & {
  /** Always-visible label text. Placeholder-only labels are a DESIGN.md prohibition. */
  label: ReactNode;
  /** Helper text rendered under the control and referenced by `aria-describedby`. */
  description?: ReactNode | undefined;
  /** Error message. Rendering it drives the invalid state and `role="alert"`. */
  error?: ReactNode | undefined;
  /** Placeholder copy — reserved for examples, never instructions. */
  placeholder?: string | undefined;
  /** Native input `type`. @default "text" */
  type?: 'text' | 'email' | 'number' | 'password' | 'search' | 'tel' | 'url' | 'date' | undefined;
  /** Escape hatch for the remaining native `<input>` attributes. */
  inputProps?: InputInputProps | undefined;
};

/** Field root. Adds the `dh-input` block class and nothing else. */
export const InputRoot = forwardRef<HTMLDivElement, InputRootProps>(function InputRoot(props, ref) {
  const { children, className, ...restProps } = props;
  return (
    <InputPrimitive.Root {...restProps} ref={ref} className={cx(INPUT_BLOCK, className)}>
      {children}
    </InputPrimitive.Root>
  );
});

/**
 * Convenience field: label + control + description + error, composed from the frozen
 * `input` anatomy parts. `required`, `disabled`, `readOnly`, `invalid`, `value` and
 * `onChange` keep the primitive's exact names and semantics.
 */
export function UIInput(props: UIInputProps): ReactNode {
  const { label, description, error, placeholder, type, inputProps, className, ...restProps } = props;
  const hasError = isPresent(error);

  return (
    <InputPrimitive.Root
      {...restProps}
      className={cx(INPUT_BLOCK, hasError ? INPUT_ERROR_MODIFIER : undefined, className)}
    >
      <InputPrimitive.Label>{label}</InputPrimitive.Label>
      <InputPrimitive.Input {...inputProps} placeholder={placeholder} type={type} />
      {isPresent(description) ? <InputPrimitive.Description>{description}</InputPrimitive.Description> : null}
      {hasError ? (
        <InputPrimitive.ErrorText icon={<span className={element(INPUT_BLOCK, 'error-glyph')}>!</span>}>
          {error}
        </InputPrimitive.ErrorText>
      ) : null}
    </InputPrimitive.Root>
  );
}

/** Callable field component plus the frozen compound parts for custom composition. */
export interface InputComponent {
  (props: UIInputProps): ReactNode;
  Root: typeof InputRoot;
  Label: typeof InputPrimitive.Label;
  Input: typeof InputPrimitive.Input;
  Description: typeof InputPrimitive.Description;
  ErrorText: typeof InputPrimitive.ErrorText;
}

export const Input: InputComponent = Object.assign(UIInput, {
  Root: InputRoot,
  Label: InputPrimitive.Label,
  Input: InputPrimitive.Input,
  Description: InputPrimitive.Description,
  ErrorText: InputPrimitive.ErrorText,
});
