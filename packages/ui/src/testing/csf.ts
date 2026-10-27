/**
 * Minimal Component Story Format 3.0 typing + runtime validator.
 *
 * Storybook is deliberately **not** installed in this repository (RESEARCH.md §5.1.2):
 * stories here are a machine-readable fixture format, not a dev-server dependency. These
 * declarations mirror the `csf` package's `Meta`/`StoryObj` shapes closely enough that the
 * same files can be lifted into a real Storybook project unchanged, and `validateCsfModule`
 * enforces the same rules at unit-test level, before any tooling reads them.
 *
 * Rules enforced (CSF 3.0 + TOKEN-API.md §6):
 *  - the default export is a `Meta` with a non-empty `title`, a `component`, and `autodocs`;
 *  - every PascalCase named export is a story object;
 *  - a story either declares `render` or inherits the one declared on the meta;
 *  - story display names (`name ?? exportName`) are unique;
 *  - every `args` key is declared in `argTypes`, and every `argTypes` entry marked
 *    `type.required` is present in the merged `meta.args` + `story.args`.
 */

import type { ReactNode } from 'react';

/** Storybook context, trimmed to the members harness code may read. */
export interface StoryContext {
  readonly name?: string;
  readonly storyName?: string;
  readonly viewMode?: 'story' | 'docs';
  readonly globals?: Readonly<Record<string, unknown>>;
}

/** A story's render function: args in, markup out. */
export type StoryRender<TArgs> = (args: TArgs, context: StoryContext) => ReactNode;

/** A component with no required props — what a decorator receives in CSF 3.0. */
export type StoryComponent = () => ReactNode;

/** Decorator: wraps the story's component for one story or the whole module. */
export type StoryDecorator<TArgs> = (Story: StoryComponent, context: StoryContext, args: TArgs) => ReactNode;

/** Control/typing metadata autodocs renders; `type.required` drives the args check. */
export interface ArgType {
  readonly action?: string;
  readonly control?: boolean | { readonly type?: string };
  readonly description?: string;
  /** Storybook accepts both spellings; `defaultValue` is the CSF 2.x-compatible one. */
  readonly default?: unknown;
  readonly defaultValue?: unknown;
  readonly mapping?: Readonly<Record<string, unknown>>;
  readonly options?: readonly unknown[];
  readonly type?: { readonly name?: string; readonly required?: boolean; readonly raw?: string };
  readonly table?: {
    readonly category?: string;
    readonly defaultValue?: { readonly summary?: string };
    readonly type?: { readonly summary?: string };
  };
}

/** Any prop-name keyed arg-type map. */
export type ArgTypes<TArgs> = Partial<Record<Extract<keyof TArgs, string>, ArgType>>;

/** The module-level default export. */
export interface Meta<TArgs> {
  readonly title: string;
  readonly component: unknown;
  readonly tags: readonly ['autodocs', ...string[]];
  readonly id?: string;
  readonly args?: Partial<TArgs>;
  readonly argTypes?: ArgTypes<TArgs>;
  readonly render?: StoryRender<TArgs>;
  readonly decorators?: readonly StoryDecorator<TArgs>[];
  readonly parameters?: Readonly<Record<string, unknown>>;
}

/** A single named story export. */
export interface StoryObj<TArgs> {
  readonly name?: string;
  readonly id?: string;
  readonly args?: Partial<TArgs>;
  readonly argTypes?: ArgTypes<TArgs>;
  readonly render?: StoryRender<TArgs>;
  readonly decorators?: readonly StoryDecorator<TArgs>[];
  readonly tags?: readonly string[];
  readonly parameters?: Readonly<Record<string, unknown>>;
}

/** Validator output: `valid` plus one human-readable sentence per violation. */
export interface CsfValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

/** `render` is optional in the object model (it may be inherited) but must be a function. */
export function isCsfStoryObject(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.render !== undefined && typeof value.render !== 'function') return false;
  if (value.args !== undefined && !isRecord(value.args)) return false;
  if (value.argTypes !== undefined && !isRecord(value.argTypes)) return false;
  if (value.name !== undefined && typeof value.name !== 'string') return false;
  if (value.id !== undefined && typeof value.id !== 'string') return false;
  if (value.tags !== undefined && !isStringArray(value.tags)) return false;
  if (value.decorators !== undefined && !Array.isArray(value.decorators)) return false;
  if (value.parameters !== undefined && !isRecord(value.parameters)) return false;
  return true;
}

/**
 * A story that satisfies the CSF 3.0 story contract: a story object that renders —
 * either with its own `render`, or by inheriting the meta's when one is supplied.
 *
 * @param value — the named export's value.
 * @param meta — the module's default export, when inheritance should count.
 */
export function isCsfStory(value: unknown, meta?: unknown): boolean {
  if (!isCsfStoryObject(value)) return false;
  if (typeof (value as Record<string, unknown>).render === 'function') return true;
  return isRecord(meta) && typeof meta.render === 'function';
}

/** The module default export shape. */
export function isCsfMeta(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.title !== 'string' || value.title.length === 0) return false;
  if (value.component === undefined || value.component === null) return false;
  if (!isStringArray(value.tags) || !value.tags.includes('autodocs')) return false;
  if (value.args !== undefined && !isRecord(value.args)) return false;
  if (value.argTypes !== undefined && !isRecord(value.argTypes)) return false;
  if (value.render !== undefined && typeof value.render !== 'function') return false;
  return true;
}

/** CSF treats a lowercase-first named export as a non-story helper; it is skipped. */
export function isStoryExportName(exportName: string): boolean {
  const first = exportName.charAt(0);
  return first === 'default' ? false : first === first.toUpperCase() && /[A-Z]/.test(first);
}

const mergedArgTypes = (meta: Record<string, unknown>, story: Record<string, unknown>): Record<string, ArgType> => {
  const declared: Record<string, ArgType> = {};
  const metaArgTypes = isRecord(meta.argTypes) ? meta.argTypes : {};
  const storyArgTypes = isRecord(story.argTypes) ? story.argTypes : {};
  for (const [key, value] of Object.entries(metaArgTypes)) {
    if (isRecord(value)) declared[key] = value as ArgType;
  }
  for (const [key, value] of Object.entries(storyArgTypes)) {
    if (isRecord(value)) declared[key] = value as ArgType;
  }
  return declared;
};

/** A validated module, reduced to the parts a runner needs. */
export interface ReadableCsfModule {
  readonly title: string;
  readonly meta: Readonly<Record<string, unknown>>;
  readonly stories: readonly (readonly [string, Readonly<Record<string, unknown>>])[];
}

/**
 * Read a `import * as stories` namespace object as CSF data: the default export plus every
 * PascalCase named export. Test code uses this instead of poking at module internals.
 */
export function readCsfModule(module: Record<string, unknown>): ReadableCsfModule {
  const meta = (module.default ?? {}) as Record<string, unknown>;
  const stories = Object.entries(module)
    .filter(([exportName]) => isStoryExportName(exportName))
    .filter(([, value]) => isCsfStoryObject(value))
    .map(([exportName, value]) => [exportName, value as Record<string, unknown>] as const);
  return { title: typeof meta.title === 'string' ? meta.title : '', meta, stories };
}

/**
 * Validate one story module the way a CSF-aware tool would read it.
 *
 * @param metaValue — the module's default export.
 * @param namedExports — every other export, keyed by export name.
 * @param moduleName — used to prefix the messages so a failure names its file.
 */
export function validateCsfModule(
  metaValue: unknown,
  namedExports: Readonly<Record<string, unknown>>,
  moduleName: string,
): CsfValidationResult {
  const errors: string[] = [];

  if (!isCsfMeta(metaValue)) {
    errors.push(`${moduleName}: default export is not a CSF Meta (needs title, component, tags: ['autodocs']).`);
    return { valid: false, errors };
  }

  const meta = metaValue as Record<string, unknown>;
  const metaArgs = isRecord(meta.args) ? meta.args : {};
  const inheritsRender = typeof meta.render === 'function';
  const displayNames = new Map<string, string>();

  for (const [exportName, storyValue] of Object.entries(namedExports)) {
    if (!isStoryExportName(exportName)) continue;

    if (!isCsfStoryObject(storyValue)) {
      errors.push(`${moduleName}.${exportName}: named export is not a CSF story object.`);
      continue;
    }

    const story = storyValue as Record<string, unknown>;

    if (typeof story.render !== 'function' && !inheritsRender) {
      errors.push(
        `${moduleName}.${exportName}: has no render of its own and the meta declares none, so nothing would render.`,
      );
    }

    const displayName = typeof story.name === 'string' ? story.name : exportName;
    const previous = displayNames.get(displayName);
    if (previous !== undefined) {
      errors.push(`${moduleName}.${displayName}: story name reused by export "${previous}".`);
    } else {
      displayNames.set(displayName, exportName);
    }

    const argTypes = mergedArgTypes(meta, story);
    const storyArgs = isRecord(story.args) ? story.args : {};
    const mergedArgs: Record<string, unknown> = { ...metaArgs, ...storyArgs };

    for (const key of Object.keys(storyArgs)) {
      // `aria-*` / `data-*` args are accepted by every DOM-backed component, so they do not
      // need an argType entry; anything else must be declared.
      if (/^(?:aria-|data-)/.test(key)) continue;
      if (!(key in argTypes)) {
        errors.push(`${moduleName}.${exportName}: args.${key} is not declared in argTypes.`);
      }
    }

    for (const [key, argType] of Object.entries(argTypes)) {
      if (argType.type?.required === true && !(key in mergedArgs)) {
        errors.push(`${moduleName}.${exportName}: required arg "${key}" is never supplied.`);
      }
    }
  }

  if (displayNames.size === 0) {
    errors.push(`${moduleName}: no story exports found.`);
  }

  return { valid: errors.length === 0, errors };
}
