import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// React 19 refuses to run act() unless the environment opts in explicitly.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The CSS/token tests run in the node environment, so every DOM-shaped patch below is
// guarded: the same setup file must be a no-op there rather than a ReferenceError.
const domScoped = globalThis as typeof globalThis & {
  HTMLElement?: { prototype: object };
  ResizeObserver?: unknown;
};

if (domScoped.HTMLElement !== undefined) {
  // jsdom has no ResizeObserver, and Zag's popper placement tracker (combobox) needs it.
  class ResizeObserverStub {
    observe(): void {
      /* the styled-layer tests never assert geometry */
    }
    unobserve(): void {
      /* the styled-layer tests never assert geometry */
    }
    disconnect(): void {
      /* the styled-layer tests never assert geometry */
    }
  }

  if (domScoped.ResizeObserver === undefined) {
    Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: ResizeObserverStub });
  }

  // jsdom reports a zero-sized box for every element, which makes Zag's focus trap treat all
  // controls as hidden and park focus on the container. Minimal box metrics keep the dialog
  // and combobox interactions observable.
  Object.defineProperties(domScoped.HTMLElement.prototype, {
    offsetWidth: { configurable: true, get: () => 96 },
    offsetHeight: { configurable: true, get: () => 40 },
  });
}

// Vitest runs without globals, so React Testing Library cannot register its own afterEach
// cleanup; unmounting between tests keeps Zag machine state isolated.
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
