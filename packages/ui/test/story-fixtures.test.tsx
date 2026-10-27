import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import * as buttonStories from '../src/button.stories.js';
import * as comboboxStories from '../src/combobox.stories.js';
import * as dataTableStories from '../src/data-table.stories.js';
import * as dialogStories from '../src/dialog.stories.js';
import * as inputStories from '../src/input.stories.js';
import {
  readCsfModule,
  type StoryContext,
  type StoryDecorator,
  type StoryRender,
} from '../src/testing/csf.js';

/**
 * Stories are fixtures, not documentation (RESEARCH.md §5.1.2).
 *
 * Every story in this package is executed here: meta args and story args are merged the way
 * a CSF runner merges them, decorators are applied outside-in, and the render must produce at
 * least one frozen anatomy part. A story that would crash in Storybook crashes here first.
 */

const argsOf = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

const storyModules: readonly Record<string, unknown>[] = [
  { ...buttonStories },
  { ...inputStories },
  { ...comboboxStories },
  { ...dialogStories },
  { ...dataTableStories },
];

/** Anatomy every component must reach, keyed by the scope its parts live in. */
const expectedScope: Readonly<Record<string, string>> = {
  Button: 'button',
  Combobox: 'combobox',
  DataTable: 'table',
  Dialog: 'dialog',
  Input: 'input',
};

for (const [index, label] of ['Button', 'Input', 'Combobox', 'Dialog', 'DataTable'].entries()) {
  const module = storyModules[index] as Record<string, unknown>;
  const scope = expectedScope[label] as string;
  const { meta, stories } = readCsfModule(module);

  describe(`${label} stories execute`, () => {
    for (const [exportName, story] of stories) {
      it(exportName, () => {
        const mergedArgs: Record<string, unknown> = { ...argsOf(meta.args), ...argsOf(story.args) };
        const rawRender = typeof story.render === 'function' ? story.render : meta.render;
        expect(typeof rawRender, `${label}.${exportName} declares no render`).toBe('function');

        const context: StoryContext = { viewMode: 'story', name: exportName, storyName: exportName };
        const renderFn = rawRender as StoryRender<Record<string, unknown>>;

        const decorators = [...(Array.isArray(meta.decorators) ? meta.decorators : []), ...(Array.isArray(story.decorators) ? story.decorators : [])] as readonly StoryDecorator<Record<string, unknown>>[];

        let Current: () => ReactNode = () => renderFn(mergedArgs, context);
        for (const decorator of [...decorators].reverse()) {
          const inner = Current;
          Current = () => decorator(inner, context, mergedArgs);
        }

        const StoryTree = (): ReactNode => Current();
        const { container } = render(<StoryTree />);

        expect(container.firstChild).not.toBeNull();
        expect(container.querySelectorAll(`[data-scope="${scope}"][data-part]`).length).toBeGreaterThan(0);

        if (exportName === 'Dark') {
          expect(container.querySelector('[data-theme="dark"]'), `${label}.Dark must apply the theme`).not.toBeNull();
        }

        // Nothing the styled layer owns may smuggle in an inline style.
        for (const element of Array.from(container.querySelectorAll<HTMLElement>('[class*="dh-"]'))) {
          if (element.hasAttribute('data-scope')) continue;
          expect(element.hasAttribute('style'), `${element.className} carries an inline style`).toBe(false);
        }
      });
    }
  });
}

describe('the state matrix DESIGN.md asks for', () => {
  it('has an open-rendered surface for the two overlay components', () => {
    const combobox = readCsfModule({ ...comboboxStories });
    const dialog = readCsfModule({ ...dialogStories });
    const names = (list: readonly (readonly [string, Readonly<Record<string, unknown>>])[]): string[] =>
      list.map(([exportName]) => exportName);
    expect(names(combobox.stories)).toContain('Open');
    expect(names(dialog.stories)).toContain('Open');

    const openDialog = dialog.stories.find(([exportName]) => exportName === 'Open')?.[1];
    expect(argsOf(openDialog?.args).defaultOpen).toBe(true);
  });

  it('has loading, empty and error fixtures for the table', () => {
    const { stories } = readCsfModule({ ...dataTableStories });
    const names = stories.map(([exportName]) => exportName);
    for (const required of ['Loading', 'Empty', 'Error']) {
      expect(names).toContain(required);
    }
    const loading = stories.find(([exportName]) => exportName === 'Loading')?.[1];
    expect(argsOf(loading?.args).rows).toEqual([]);
    expect(argsOf(loading?.args).loading).toBe(true);
    const failed = stories.find(([exportName]) => exportName === 'Error')?.[1];
    expect(typeof argsOf(failed?.args).error).toBe('string');
  });
});
