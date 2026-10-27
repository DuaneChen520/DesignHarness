import type { Context, ReactNode } from 'react';
import { createContext, useContext } from 'react';

interface PartContextPair<T> {
  Provider: Context<T | undefined>;
  useContext: () => T;
}

/**
 * Typed context for compound components with a readable failure mode when a part
 * is rendered outside of its `Root`.
 */
export const createPartContext = <T,>(name: string): PartContextPair<T> => {
  const Context = createContext<T | undefined>(undefined);
  const usePartContext = (): T => {
    const value = useContext(Context);
    if (value === undefined) {
      throw new Error(`[designharness/primitives] <${name}> part must be rendered inside its Root component`);
    }
    return value;
  };
  return { Provider: Context, useContext: usePartContext };
};

/** Children can be a node or a render function over the part state. */
export type PartChildren<TState> = ReactNode | ((state: TState) => ReactNode);

export const renderPartChildren = <TState,>(children: PartChildren<TState>, state: TState): ReactNode =>
  typeof children === 'function' ? children(state) : children;
