import type { ComponentPropsWithRef, ReactNode } from 'react';
import { createContext, forwardRef, useCallback, useContext, useId, useLayoutEffect, useMemo, useState } from 'react';
import { inputAnatomy } from './internal/anatomy.js';
import { ariaAttr, createSlotRegistry, dataAttr, joinIds, useRegistrySnapshot } from './internal/props.js';

/** Ids of the field elements; every part falls back to a deterministic generated id. */
export interface InputElementIds {
  root?: string | undefined;
  label?: string | undefined;
  input?: string | undefined;
  description?: string | undefined;
  errorText?: string | undefined;
}

/** Field-level state props, declared once on `Input.Root` and consumed by the parts. */
export interface InputBehaviorProps {
  /** Controlled input value. */
  value?: string | undefined;
  /** Uncontrolled initial value. */
  defaultValue?: string | undefined;
  /** Called with the next value and the reason it changed. */
  onChange?: ((value: string, details: { method: 'input' | 'script' }) => void) | undefined;
  /** The `name` attribute of the generated input control (form submission). */
  name?: string | undefined;
  /** Disables the control (`data-disabled` + native `disabled`). */
  disabled?: boolean | undefined;
  /** Marks the control as required (`aria-required` + native `required`). */
  required?: boolean | undefined;
  /** Makes the control read-only. */
  readOnly?: boolean | undefined;
  /**
   * Forces the invalid state. Defaults to `true` whenever an `Input.ErrorText` is
   * rendered, so an error is never signalled by colour alone.
   */
  invalid?: boolean | undefined;
  /** Ids of the field elements, for composition and server-side rendering. */
  ids?: InputElementIds | undefined;
}

export type InputRootProps = Omit<ComponentPropsWithRef<'div'>, 'onChange' | 'defaultValue' | 'value'> &
  InputBehaviorProps;

interface InputContextValue {
  ids: Required<InputElementIds>;
  registry: ReturnType<typeof createSlotRegistry>;
  disabled: boolean;
  required: boolean;
  readOnly: boolean;
  invalid: boolean;
  focused: boolean;
  name: string | undefined;
  value: string;
  setValue: (value: string, method: 'input' | 'script') => void;
  setFocused: (focused: boolean) => void;
}

const InputContext = createContext<InputContextValue | null>(null);

const useInputContext = (): InputContextValue => {
  const context = useContext(InputContext);
  if (context === null) {
    throw new Error('[designharness/primitives] <Input.*> part must be rendered inside <Input.Root>.');
  }
  return context;
};

/** Registry slot names, in `aria-describedby` order: description first, error second. */
const DESCRIBED_BY_SLOTS = ['description', 'errorText'] as const;

/**
 * Headless text field. Wires label→control association, `aria-describedby` joining the
 * description and error ids, `aria-invalid`/`aria-required`, and announces errors
 * through `role="alert"`.
 *
 * Emits `data-scope="input"` and the frozen `input` anatomy:
 * `root`, `label`, `input`, `description`, `errorText`.
 */
export const InputRoot = forwardRef<HTMLDivElement, InputRootProps>(function InputRoot(props, ref) {
  const {
    ids: idsProp,
    value: valueProp,
    defaultValue,
    onChange,
    name,
    disabled = false,
    required = false,
    readOnly = false,
    invalid: invalidProp,
    children,
    ...domProps
  } = props;

  const baseId = useId();
  const registry = useMemo(() => createSlotRegistry(), []);
  const [internalValue, setInternalValue] = useState(defaultValue ?? '');
  const [focused, setFocused] = useState(false);

  const ids = useMemo<Required<InputElementIds>>(
    () => ({
      root: idsProp?.root ?? `input:${baseId}`,
      label: idsProp?.label ?? `input:${baseId}:label`,
      input: idsProp?.input ?? `input:${baseId}:input`,
      description: idsProp?.description ?? `input:${baseId}:description`,
      errorText: idsProp?.errorText ?? `input:${baseId}:errorText`,
    }),
    [baseId, idsProp?.root, idsProp?.label, idsProp?.input, idsProp?.description, idsProp?.errorText],
  );

  const describedBy = useRegistrySnapshot(registry, DESCRIBED_BY_SLOTS);
  const hasErrorText = describedBy.split(' ').includes(ids.errorText);
  const invalid = invalidProp ?? hasErrorText;
  const value = valueProp ?? internalValue;

  const setValue = useCallback(
    (next: string, method: 'input' | 'script') => {
      if (valueProp === undefined) setInternalValue(next);
      onChange?.(next, { method });
    },
    [onChange, valueProp],
  );

  const context = useMemo<InputContextValue>(
    () => ({
      ids,
      registry,
      disabled,
      required,
      readOnly,
      invalid,
      focused,
      name,
      value,
      setValue,
      setFocused,
    }),
    [ids, registry, disabled, required, readOnly, invalid, focused, name, value, setValue],
  );

  return (
    <InputContext.Provider value={context}>
      <div
        {...domProps}
        ref={ref}
        id={ids.root}
        {...inputAnatomy.root.attrs}
        data-invalid={dataAttr(invalid)}
        data-disabled={dataAttr(disabled)}
        data-readonly={dataAttr(readOnly)}
        data-required={dataAttr(required)}
        data-focus={dataAttr(focused)}
      >
        {children}
      </div>
    </InputContext.Provider>
  );
});

export type InputLabelProps = Omit<ComponentPropsWithRef<'label'>, 'htmlFor'>;

/** Visible label, always associated with the control through `htmlFor`. */
export const InputLabel = forwardRef<HTMLLabelElement, InputLabelProps>(function InputLabel(props, ref) {
  const { children, ...domProps } = props;
  const { ids, invalid, disabled, required, focused } = useInputContext();
  return (
    <label
      {...domProps}
      ref={ref}
      id={ids.label}
      htmlFor={ids.input}
      {...inputAnatomy.label.attrs}
      data-invalid={dataAttr(invalid)}
      data-disabled={dataAttr(disabled)}
      data-required={dataAttr(required)}
      data-focus={dataAttr(focused)}
    >
      {children}
    </label>
  );
});

export type InputInputProps = Omit<
  ComponentPropsWithRef<'input'>,
  'value' | 'defaultValue' | 'id' | 'disabled' | 'readOnly' | 'required' | 'name'
> &
  Pick<InputBehaviorProps, 'disabled' | 'readOnly' | 'required' | 'name'>;

/** The `<input>` control: owns `aria-invalid`, `aria-required` and `aria-describedby`. */
export const InputInput = forwardRef<HTMLInputElement, InputInputProps>(function InputInput(props, ref) {
  const { 'aria-describedby': describedByProp, onFocus, onBlur, onChange, ...domProps } = props;
  const context = useInputContext();
  const describedBy = useRegistrySnapshot(context.registry, DESCRIBED_BY_SLOTS);
  const { ids, invalid, required, disabled, readOnly, value } = context;

  return (
    <input
      {...domProps}
      ref={ref}
      id={ids.input}
      {...inputAnatomy.input.attrs}
      value={value}
      name={props.name ?? context.name}
      disabled={props.disabled ?? disabled}
      readOnly={props.readOnly ?? readOnly}
      required={props.required ?? required}
      aria-required={ariaAttr(required)}
      aria-invalid={ariaAttr(invalid)}
      aria-describedby={joinIds(describedBy, describedByProp)}
      data-invalid={dataAttr(invalid)}
      data-disabled={dataAttr(disabled)}
      data-readonly={dataAttr(readOnly)}
      data-required={dataAttr(required)}
      data-focus={dataAttr(context.focused)}
      onFocus={(event) => {
        context.setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        context.setFocused(false);
        onBlur?.(event);
      }}
      onChange={(event) => {
        onChange?.(event);
        context.setValue(event.currentTarget.value, 'input');
      }}
    />
  );
});

export type InputDescriptionProps = Omit<ComponentPropsWithRef<'div'>, 'id'>;

/** Helper text; registers itself so the control can reference it in `aria-describedby`. */
export const InputDescription = forwardRef<HTMLDivElement, InputDescriptionProps>(function InputDescription(
  props,
  ref,
) {
  const { children, ...domProps } = props;
  const { ids, registry, invalid, disabled, focused } = useInputContext();
  useLayoutEffect(() => registry.register('description', ids.description), [registry, ids.description]);
  return (
    <div
      {...domProps}
      ref={ref}
      id={ids.description}
      {...inputAnatomy.description.attrs}
      data-invalid={dataAttr(invalid)}
      data-disabled={dataAttr(disabled)}
      data-focus={dataAttr(focused)}
    >
      {children}
    </div>
  );
});

export type InputErrorTextProps = Omit<ComponentPropsWithRef<'div'>, 'id'> & {
  /** Optional decorative icon rendered next to the message, so colour is never the signal. */
  icon?: ReactNode;
};

/**
 * Error message element. `role="alert"` announces it when it appears; rendering it
 * also drives the field into the invalid state unless `invalid` was set explicitly.
 */
export const InputErrorText = forwardRef<HTMLDivElement, InputErrorTextProps>(function InputErrorText(props, ref) {
  const { children, icon, ...domProps } = props;
  const { ids, registry, disabled } = useInputContext();
  useLayoutEffect(() => registry.register('errorText', ids.errorText), [registry, ids.errorText]);
  return (
    <div
      {...domProps}
      ref={ref}
      id={ids.errorText}
      {...inputAnatomy.errorText.attrs}
      role="alert"
      data-disabled={dataAttr(disabled)}
    >
      {icon !== undefined ? <span aria-hidden="true">{icon}</span> : null}
      {children}
    </div>
  );
});

export interface InputNamespace {
  Root: typeof InputRoot;
  Label: typeof InputLabel;
  Input: typeof InputInput;
  Description: typeof InputDescription;
  ErrorText: typeof InputErrorText;
}

/** Compound namespace mirroring the frozen `input` anatomy. */
export const Input: InputNamespace = {
  Root: InputRoot,
  Label: InputLabel,
  Input: InputInput,
  Description: InputDescription,
  ErrorText: InputErrorText,
};
