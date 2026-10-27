import { describe, expect, it } from 'vitest';
import { isCsfMeta, isCsfStory, isCsfStoryObject, readCsfModule, validateCsfModule } from '../src/testing/csf.js';
import * as buttonStories from '../src/button.stories.js';
import * as comboboxStories from '../src/combobox.stories.js';
import * as dataTableStories from '../src/data-table.stories.js';
import * as dialogStories from '../src/dialog.stories.js';
import * as inputStories from '../src/input.stories.js';

/**
 * CSF 3.0 conformance.
 *
 * Every story file must parse as a valid CSF module under the same rules a Storybook build
 * would apply, and the validator itself has to reject the ways a story file usually rots.
 */

interface StoryModuleContract {
  readonly label: string;
  readonly title: string;
  readonly module: Record<string, unknown>;
  /** The states DESIGN.md names, filtered to the ones this component can actually be in. */
  readonly states: readonly string[];
}

const storyModules: readonly StoryModuleContract[] = [
  {
    label: 'Button',
    title: 'ui/Button',
    module: { ...buttonStories },
    states: ['Default', 'Secondary', 'Disabled', 'Loading', 'WithError', 'Dark'],
  },
  {
    label: 'Input',
    title: 'ui/Input',
    module: { ...inputStories },
    // `Secondary` is the optional (unmarked) field, `Loading` the read-only refresh case.
    states: ['Default', 'Secondary', 'Disabled', 'Loading', 'WithError', 'Dark'],
  },
  {
    label: 'Combobox',
    title: 'ui/Combobox',
    module: { ...comboboxStories },
    states: ['Default', 'Open', 'Secondary', 'Disabled', 'Loading', 'WithError', 'Dark'],
  },
  {
    label: 'Dialog',
    title: 'ui/Dialog',
    module: { ...dialogStories },
    states: ['Default', 'Open', 'Secondary', 'Disabled', 'Loading', 'WithError', 'Dark'],
  },
  {
    label: 'DataTable',
    title: 'ui/DataTable',
    // A read-only data surface has no disabled state, and `Error` is its failure state.
    module: { ...dataTableStories },
    states: ['Default', 'Secondary', 'Loading', 'Empty', 'Error', 'Dark'],
  },
];

describe('every story module is valid CSF 3.0', () => {
  for (const contract of storyModules) {
    describe(contract.label, () => {
      const meta = contract.module.default;

      it('declares a meta with title, component and autodocs', () => {
        expect(isCsfMeta(meta)).toBe(true);
        expect((meta as { title: string }).title).toBe(contract.title);
      });

      it('validates without errors', () => {
        const { valid, errors } = validateCsfModule(meta, contract.module, contract.label);
        expect(errors).toEqual([]);
        expect(valid).toBe(true);
      });

      it('has only story-shaped named exports that render', () => {
        const { stories } = readCsfModule(contract.module);
        const namedExports = Object.keys(contract.module).filter((name) => name !== 'default');
        expect(stories).toHaveLength(namedExports.length);
        for (const [exportName, story] of stories) {
          expect(isCsfStoryObject(story), exportName).toBe(true);
          expect(isCsfStory(story, meta), `${exportName} must render or inherit render`).toBe(true);
        }
      });

      it('covers the states DESIGN.md names', () => {
        const exported = Object.keys(contract.module).filter((name) => name !== 'default');
        expect(exported).toEqual(expect.arrayContaining([...contract.states]));
      });

      it('keeps story names unique and PascalCase', () => {
        const { stories } = readCsfModule(contract.module);
        const displayNames = stories.map(([exportName, story]) =>
          typeof story.name === 'string' ? story.name : exportName,
        );
        expect(new Set(displayNames).size).toBe(displayNames.length);
        for (const [exportName] of stories) {
          expect(/^[A-Z]/.test(exportName), exportName).toBe(true);
        }
      });
    });
  }
});

describe('the validator rejects the ways a story file rots', () => {
  const goodMeta = {
    title: 'ui/Broken',
    component: () => null,
    tags: ['autodocs'] as const,
    argTypes: { label: { type: { name: 'string', required: true } }, size: { control: true } },
    args: { label: 'Risk limit' },
  };

  it('rejects a meta without a component', () => {
    expect(isCsfMeta({ title: 'ui/X', tags: ['autodocs'] })).toBe(false);
    expect(isCsfMeta({ title: '', component: () => null, tags: ['autodocs'] })).toBe(false);
    expect(isCsfMeta({ title: 'ui/X', component: () => null, tags: [] })).toBe(false);
  });

  it('rejects a story that cannot render', () => {
    const { errors, valid } = validateCsfModule({ ...goodMeta, render: undefined }, { Default: { args: {} } }, 'Broken');
    expect(valid).toBe(false);
    expect(errors.join('\n')).toContain('nothing would render');
  });

  it('rejects an unknown args key', () => {
    const { errors } = validateCsfModule(goodMeta, { Default: { args: { colour: 'red' } } }, 'Broken');
    expect(errors.join('\n')).toContain('args.colour is not declared in argTypes');
    // ARIA/data args are DOM-level and exempt from the argTypes requirement.
    const renderable = { ...goodMeta, render: () => null };
    const ariaArgs = validateCsfModule(renderable, { Default: { args: { 'aria-label': 'Risk limit' } } }, 'Broken');
    expect(ariaArgs.errors).toEqual([]);
    expect(ariaArgs.valid).toBe(true);
  });

  it('rejects a missing required arg', () => {
    const declared = validateCsfModule(goodMeta, { Default: { args: { size: 'md' } } }, 'Broken');
    expect(declared.errors.join('\n')).not.toContain('args.label is not declared');
    const stripped = validateCsfModule({ ...goodMeta, args: {} }, { Default: { args: { size: 'md' } } }, 'Broken');
    expect(stripped.errors.join('\n')).toContain('required arg "label" is never supplied');
  });

  it('rejects a duplicated story name', () => {
    const { errors } = validateCsfModule(
      { ...goodMeta, render: () => null },
      { Default: { args: {} }, AlsoDefault: { name: 'Default', args: {} } },
      'Broken',
    );
    expect(errors.join('\n')).toContain('story name reused');
  });

  it('rejects malformed story values', () => {
    expect(isCsfStoryObject('nope')).toBe(false);
    expect(isCsfStoryObject({ render: 'nope' })).toBe(false);
    expect(isCsfStoryObject({ args: 'nope' })).toBe(false);
    expect(isCsfStoryObject({ tags: 'autodocs' })).toBe(false);
  });

  it('skips lowercase named exports, which CSF treats as helpers', () => {
    expect(readCsfModule({ ...goodMeta, helper: () => null, Default: { args: {} } }).stories.map(([name]) => name)).toEqual(
      ['Default'],
    );
  });
});
