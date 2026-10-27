/**
 * The story registry: CSF 3.0 modules read as fixture data (RESEARCH.md §5.1.2).
 *
 * Storybook is not installed in this repository — the `*.stories.tsx` modules in
 * `@designharness/ui` *are* the fixture source, read through the package's own CSF
 * reader (`readCsfModule`, the same function `packages/ui/test/story-fixtures.test.tsx`
 * uses), so the showcase cannot invent states the design system never declared.
 *
 * The import path is relative rather than a bare specifier on purpose: `@designharness/ui`
 * exposes `.` and `./styles.css` to consumers, and stories are not part of that public
 * surface (TOKEN-API.md §4). A fixture host is allowed to reach behind the curtain — that
 * is the whole of its job — but it does it against the package's compiled CSF modules, not
 * against a copy of the args it typed by hand.
 */
import type { ReadableCsfModule } from '../../../packages/ui/dist/testing/csf.js';
import { readCsfModule } from '../../../packages/ui/dist/testing/csf.js';
import * as buttonStories from '../../../packages/ui/dist/button.stories.js';
import * as comboboxStories from '../../../packages/ui/dist/combobox.stories.js';
import * as dataTableStories from '../../../packages/ui/dist/data-table.stories.js';
import * as dialogStories from '../../../packages/ui/dist/dialog.stories.js';
import * as inputStories from '../../../packages/ui/dist/input.stories.js';

/** The token modes the artifact ships (TOKEN-API.md §3 cascade). */
export const TOKEN_MODES = ['light', 'dark', 'high-contrast'] as const;
export type TokenMode = (typeof TOKEN_MODES)[number];

/**
 * Component ids, in the order TOKEN-API.md §6 freezes them, paired with the CSF module
 * that states them. A component with no story module is a gate failure, not an empty
 * gallery — hence the explicit table rather than a glob.
 *
 * Each entry is the module *namespace* (`import * as`), not its default export: a CSF
 * module's data is `default` (the meta) plus one PascalCase export per story, and
 * `readCsfModule` reads exactly that shape.
 */
const STORY_MODULES: readonly (readonly [string, object])[] = [
  ['button', buttonStories],
  ['input', inputStories],
  ['combobox', comboboxStories],
  ['dialog', dialogStories],
  ['data-table', dataTableStories],
];

/** One story, reduced to what a fixture host needs to render it. */
export interface StoryFixture {
  /** Stable, DOM-safe identity: `ui-button--default`. */
  readonly storyId: string;
  /** The component id from TOKEN-API.md §6. */
  readonly componentId: string;
  /** The CSF `title`, verbatim: `ui/Button`. */
  readonly title: string;
  /** The export name: `Default`. */
  readonly exportName: string;
  /** `name ?? exportName`, the CSF display name. */
  readonly displayName: string;
  /** The module's `meta` as data. */
  readonly meta: Readonly<Record<string, unknown>>;
  /** The story object as data. */
  readonly story: Readonly<Record<string, unknown>>;
  /** `meta.args` overlaid by `story.args` — the CSF merge, nothing else. */
  readonly args: Readonly<Record<string, unknown>>;
}

/** One rendered story in one token mode: the unit the sensors scan. */
export interface StorySection {
  readonly sectionId: string;
  readonly mode: TokenMode;
  readonly fixture: StoryFixture;
}

const slug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const asArgs = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

function readModule(componentId: string, module: Record<string, unknown>): readonly StoryFixture[] {
  const parsed: ReadableCsfModule = readCsfModule(module);
  if (parsed.title.length === 0) {
    throw new Error(`story registry: module for "${componentId}" has no CSF title — the fixture host would render nothing.`);
  }
  if (parsed.stories.length === 0) {
    throw new Error(`story registry: module "${parsed.title}" exports no stories — the fixture host would render nothing.`);
  }

  const meta = parsed.meta;
  const metaArgs = asArgs(meta.args);

  return parsed.stories.map(([exportName, story]) => {
    const storyId = `${slug(parsed.title)}--${slug(exportName)}`;
    return {
      storyId,
      componentId,
      title: parsed.title,
      exportName,
      displayName: typeof story.name === 'string' ? story.name : exportName,
      meta,
      story,
      args: { ...metaArgs, ...asArgs(story.args) },
    } satisfies StoryFixture;
  });
}

/** Every story of every shipped component, in TOKEN-API.md §6 order. */
export const STORY_FIXTURES: readonly StoryFixture[] = STORY_MODULES.flatMap(([componentId, module]) =>
  readModule(componentId, module as unknown as Record<string, unknown>),
);

/**
 * Every story × every token mode. The gallery renders this list, and the a11y and visual
 * gates scan exactly what the DOM carries — this list is the expectation they compare to.
 */
export const STORY_SECTIONS: readonly StorySection[] = STORY_FIXTURES.flatMap((fixture) =>
  TOKEN_MODES.map((mode) => ({ sectionId: `${fixture.storyId}--${mode}`, mode, fixture })),
);

/** Sections grouped by component id, for the gallery's one-group-per-component layout. */
export const SECTIONS_BY_COMPONENT: readonly (readonly [string, readonly StorySection[]])[] = STORY_MODULES.map(
  ([componentId]) => [componentId, STORY_SECTIONS.filter((section) => section.fixture.componentId === componentId)] as const,
);

/**
 * An open modal dialog hides the rest of the page from assistive technology — correct in
 * an app, and fatal in a gallery that holds every state at once. The gallery therefore
 * mounts dialog surfaces non-modally (see `styles.css` for the overlay re-scoping) and the
 * real modal contract is asserted where exactly one dialog is open: `e2e/keyboard.spec.ts`.
 */
export function galleryArgs(fixture: StoryFixture): Record<string, unknown> {
  if (fixture.componentId !== 'dialog') {
    return { ...fixture.args };
  }
  return { ...fixture.args, modal: false };
}
