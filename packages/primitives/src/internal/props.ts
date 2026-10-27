import type { Ref } from 'react';
import { useCallback, useSyncExternalStore } from 'react';

/**
 * Attribute value emitted by Zag/Ark for a present boolean state flag (`data-disabled=""`).
 */
export const dataAttr = (value: boolean | undefined): '' | undefined => (value ? '' : undefined);

/**
 * `aria-*` boolean attribute: emitted only when the state is active, so that the
 * absence of the attribute (not `aria-invalid="false"`) is the negative state.
 */
export const ariaAttr = (value: boolean | undefined): 'true' | undefined => (value ? 'true' : undefined);

/** Join non-empty id references for `aria-describedby` / `aria-labelledby`. */
export const joinIds = (...ids: Array<string | undefined | false>): string | undefined => {
  const parts = ids.filter((id): id is string => typeof id === 'string' && id.length > 0);
  return parts.length > 0 ? parts.join(' ') : undefined;
};

/**
 * Splits machine props out of the props that should be forwarded to the DOM element.
 * Mirrors Ark UI's `splitProps` reference implementation without mutating the input.
 */
export function splitProps<T extends object, K extends keyof T>(
  props: T,
  keys: readonly K[],
): [Partial<Pick<T, K>>, Omit<T, K>] {
  const machineProps: Partial<Pick<T, K>> = {};
  const restProps = { ...props } as Partial<T>;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(props, key)) {
      (machineProps as Partial<T>)[key] = props[key];
      delete restProps[key];
    }
  }
  return [machineProps, restProps as Omit<T, K>];
}

/** Merge callback/object refs into one stable callback ref. */
export const composeRefs =
  <T>(...refs: Array<Ref<T> | undefined>): ((node: T | null) => void) =>
  (node) => {
    for (const ref of refs) {
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref != null) {
        const mutable = ref as { current: T | null };
        mutable.current = node;
      }
    }
  };

/**
 * Composes event handlers in precedence order (consumer handlers first, so their
 * `event.preventDefault()` is honoured by the machine handlers that follow) while
 * keeping the element's own event type.
 */
export const chainHandlers =
  <TEvent>(...handlers: Array<((event: TEvent) => void) | undefined>): ((event: TEvent) => void) =>
  (event) => {
    for (const handler of handlers) {
      handler?.(event);
    }
  };

/**
 * A tiny subscription store used by parts that must contribute to a sibling's
 * `aria-describedby` list. Children register in an effect (never during render),
 * so the value can be read with `useSyncExternalStore` without tearing.
 */
export interface SlotRegistry {
  subscribe: (onStoreChange: () => void) => () => void;
  register: (slot: string, id: string) => () => void;
  describe: (slots: readonly string[]) => string;
}

export const createSlotRegistry = (): SlotRegistry => {
  const slots = new Map<string, string>();
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  return {
    subscribe(onStoreChange) {
      listeners.add(onStoreChange);
      return () => {
        listeners.delete(onStoreChange);
      };
    },
    register(slot, id) {
      const isSame = slots.get(slot) === id;
      if (!isSame) {
        slots.set(slot, id);
        emit();
      }
      return () => {
        if (isSame || slots.get(slot) !== id) return;
        slots.delete(slot);
        emit();
      };
    },
    describe(keys) {
      const resolved: string[] = [];
      for (const key of keys) {
        const id = slots.get(key);
        if (id) resolved.push(id);
      }
      return resolved.join(' ');
    },
  };
};

/** Reads a space separated id list from the registry; stable across re-subscriptions. */
export const useRegistrySnapshot = (registry: SlotRegistry, slots: readonly string[]): string => {
  const key = slots.join('|');
  const subscribe = useCallback((onStoreChange: () => void) => registry.subscribe(onStoreChange), [registry]);
  const getSnapshot = useCallback(() => registry.describe(key.split('|')), [registry, key]);
  const getServerSnapshot = useCallback((): string => '', []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
};

const isDevelopment = (): boolean => process.env.NODE_ENV !== 'production';

/**
 * Accessibility contract guard. Accessible-name/`aria-*` requirements are hard
 * failures of the design-system contract: they throw in development builds and
 * degrade to a console error in production instead of crashing the host app.
 */
export const assertContract = (condition: boolean, message: string): void => {
  if (condition) return;
  if (isDevelopment()) throw new Error(`[designharness/primitives] ${message}`);
  console.error(`[designharness/primitives] ${message}`);
};
