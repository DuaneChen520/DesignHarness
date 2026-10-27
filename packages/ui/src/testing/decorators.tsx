import type { ReactNode } from 'react';
import type { StoryDecorator } from './csf.js';

/**
 * Story decorators shared by every `*.stories.tsx`.
 *
 * `args` is typed `unknown` on purpose: the decorator only wraps, so it is assignable to
 * any component's `StoryDecorator<TArgs>` without a cast.
 */

/** Applies the dark token mode through the `[data-theme]` cascade the token artifact owns. */
export const withDarkTheme: StoryDecorator<unknown> = (StoryComponent): ReactNode => (
  <div data-theme="dark">
    <StoryComponent />
  </div>
);

/** High-contrast mode: pure surfaces, 3:1 borders, no subtlety (DESIGN.md "Colors"). */
export const withHighContrastTheme: StoryDecorator<unknown> = (StoryComponent): ReactNode => (
  <div data-theme="high-contrast">
    <StoryComponent />
  </div>
);
