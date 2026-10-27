import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// React 19 refuses to run act() unless the environment opts in explicitly.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no ResizeObserver, and Zag's popper placement tracker (combobox) needs it.
class ResizeObserverStub {
  observe(): void {
    /* the headless tests never assert geometry */
  }
  unobserve(): void {
    /* the headless tests never assert geometry */
  }
  disconnect(): void {
    /* the headless tests never assert geometry */
  }
}

Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: ResizeObserverStub });

// jsdom reports a zero-sized box for every element, which makes Zag's focus-trap treat
// all controls as hidden and park focus on the container. Give elements minimal box
// metrics so keyboard navigation (Tab cycling inside a dialog, roving grid focus) is
// observable.
Object.defineProperties(HTMLElement.prototype, {
  offsetWidth: { configurable: true, get: () => 96 },
  offsetHeight: { configurable: true, get: () => 40 },
});

// Vitest runs without globals, so React Testing Library cannot register its own
// afterEach cleanup; unmounting between tests keeps Zag machine state isolated.
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
