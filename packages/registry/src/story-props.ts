/**
 * CSF 3.0 `argTypes` reader.
 *
 * `packages/ui` writes its stories with a real `argTypes` block — the ui package
 * documents them as "the component's state contract in a machine-readable form"
 * (TOKEN-API.md §6), and `src/testing/csf.ts` validates that every `args` key is
 * declared there. When the ts-morph extractor cannot see a component's props — every
 * Meridian component is a `forwardRef(...)` call, whose inner function the engine does
 * not walk — the story is the second authored, checked-in description of the same
 * surface, so the registry reads it instead of publishing an empty prop list.
 *
 * This is a bounded reader, not a TypeScript parser: it locates the `argTypes` object,
 * splits its top-level entries on brace depth, and pulls the handful of fields CSF
 * defines (`type`, `options`, `defaultValue`/`default`, `description`, `control`).
 * `options: BUTTON_VARIANTS` is resolved against the component's own
 * `export const BUTTON_VARIANTS = [...] as const` line, which is where the ui layer
 * freezes it.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { uiSourceRoot } from './paths.js';
import type { PropDescriptor } from './metadata.js';

interface RawEntry {
  readonly key: string;
  readonly value: string;
}

/** Index of the brace closing the one at `open`, honouring strings and comments. */
function matchingBrace(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (char === "'" || char === '"' || char === '`') {
      index = skipString(text, index);
      continue;
    }
    if (char === '/' && text[index + 1] === '/') {
      while (index < text.length && text[index] !== '\n') index += 1;
      continue;
    }
    if (char === '/' && text[index + 1] === '*') {
      const end = text.indexOf('*/', index + 2);
      index = end === -1 ? text.length : end + 1;
      continue;
    }
    if (char === '{' || char === '[' || char === '(') depth += 1;
    else if (char === '}' || char === ']' || char === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error('unbalanced object literal while reading argTypes');
}

function skipString(text: string, quoteIndex: number): number {
  const quote = text[quoteIndex];
  let index = quoteIndex + 1;
  while (index < text.length) {
    const char = text[index];
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (char === quote) return index;
    index += 1;
  }
  throw new Error('unterminated string literal while reading argTypes');
}

/** Split an object literal body into its top-level `key: value` entries. */
function objectEntries(text: string, open: number): { entries: RawEntry[]; close: number } {
  const close = matchingBrace(text, open);
  const body = text.slice(open + 1, close);
  const entries: RawEntry[] = [];
  let cursor = 0;
  while (cursor < body.length) {
    const keyMatch = /^\s*(?:\/\/[^\n]*\n|\s)*([A-Za-z_$][A-Za-z0-9_$]*|'[^']*'|"[^"]*")\s*:\s*/.exec(body.slice(cursor));
    if (keyMatch === null || keyMatch[1] === undefined) break;
    const key = keyMatch[1].replace(/^['"]|['"]$/g, '');
    const valueStart = cursor + keyMatch[0].length;
    let index = valueStart;
    let depth = 0;
    while (index < body.length) {
      const char = body[index];
      if (char === "'" || char === '"' || char === '`') {
        index = skipString(body, index) + 1;
        continue;
      }
      if (char === '{' || char === '[' || char === '(') depth += 1;
      else if (char === '}' || char === ']' || char === ')') depth -= 1;
      else if (char === ',' && depth === 0) break;
      index += 1;
    }
    entries.push({ key, value: body.slice(valueStart, index).trim() });
    cursor = index + 1;
  }
  return { entries, close };
}

const stripQuotes = (value: string): string => value.replace(/^['"`]|['"`]$/g, '');

/** `['sm', 'md', 'lg']` → `["sm", "md", "lg"]`; an identifier is resolved by `lookup`. */
function optionValues(raw: string, lookup: (identifier: string) => string[] | undefined): string[] | undefined {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    const inner = trimmed.slice(1, trimmed.lastIndexOf(']'));
    const items = inner
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map(stripQuotes);
    return items.length > 0 ? items : undefined;
  }
  if (/^[A-Z][A-Z0-9_]*$/.test(trimmed)) return lookup(trimmed);
  return undefined;
}

/** `export const BUTTON_VARIANTS = ['primary', …] as const` in the component source. */
function constantResolver(sourceText: string): (identifier: string) => string[] | undefined {
  return (identifier) => {
    const pattern = new RegExp(`export const ${identifier}\\s*(?::[^=]*)?=\\s*\\[([^\\]]*)\\]`, 's');
    const match = pattern.exec(sourceText);
    if (match?.[1] === undefined) return undefined;
    const items = match[1]
      .split(',')
      .map((part) => stripQuotes(part.trim()))
      .filter((part) => part.length > 0 && !part.startsWith('/'));
    return items.length > 0 ? items : undefined;
  };
}

function valueOf(entries: readonly RawEntry[], key: string): string | undefined {
  return entries.find((entry) => entry.key === key)?.value;
}

/** Turn one argType object into a prop descriptor, or `undefined` when it says nothing. */
function propFrom(argType: readonly RawEntry[], lookup: (identifier: string) => string[] | undefined): PropDescriptor | undefined {
  const nested = (key: string): readonly RawEntry[] | undefined => {
    const raw = valueOf(argType, key);
    return raw !== undefined && raw.trim().startsWith('{') ? objectEntries(raw.trim(), 0).entries : undefined;
  };

  const typeEntries = nested('type');
  const controlRaw = valueOf(argType, 'control');
  const controlEntries = controlRaw !== undefined && controlRaw.trim().startsWith('{') ? objectEntries(controlRaw.trim(), 0).entries : undefined;
  const controlType = controlEntries === undefined ? undefined : valueOf(controlEntries, 'type');

  const description = valueOf(argType, 'description');
  const defaultValue = valueOf(argType, 'defaultValue') ?? valueOf(argType, 'default');
  const optionsRaw = valueOf(argType, 'options');
  const options = optionsRaw === undefined ? undefined : optionValues(optionsRaw, lookup);
  const required = typeEntries === undefined ? false : valueOf(typeEntries, 'required') === 'true';

  // Resolution order: the written type, then the declared option list, then the Storybook
  // type name, then the control. A `select` whose options are an imported constant stays
  // the constant's name rather than being invented here.
  const rawType = typeEntries === undefined ? undefined : valueOf(typeEntries, 'raw');
  const namedType = typeEntries === undefined ? undefined : valueOf(typeEntries, 'name');
  let type: string | undefined;
  if (rawType !== undefined) type = stripQuotes(rawType);
  else if (options !== undefined && options.length > 0) type = options.map((value) => `"${value}"`).join(' | ');
  else if (optionsRaw !== undefined && /^[A-Z][A-Z0-9_]*$/.test(optionsRaw.trim())) type = `(typeof ${optionsRaw.trim()})[number]`;
  else if (namedType !== undefined) type = stripQuotes(namedType);
  else if (controlType !== undefined) {
    const control = stripQuotes(controlType);
    if (control === 'boolean') type = 'boolean';
    else if (control === 'number') type = 'number';
    else if (control === 'multi-select' || control === 'check') type = 'string[]';
    else type = 'string';
  }
  if (type === undefined) return undefined;

  return {
    name: '',
    type,
    required,
    ...(defaultValue !== undefined ? { default: defaultValue } : {}),
    ...(description !== undefined ? { description: stripQuotes(description) } : {}),
  };
}

/** Meta keys that sit beside real props in an `argTypes` object. */
const NON_PROP_KEYS = new Set(['component', 'args', 'argTypes', 'render', 'decorators', 'tags', 'title', 'parameters', 'id', 'name']);

/**
 * Read the authored prop surface from a story module.
 *
 * @param storyPath absolute path to `<id>.stories.tsx`
 * @param componentSourceText the component's own source, used to resolve `options: CONSTANT`
 */
export async function readStoryProps(storyPath: string, componentSourceText: string): Promise<readonly PropDescriptor[]> {
  let storyText: string;
  try {
    storyText = await readFile(storyPath, 'utf8');
  } catch {
    return [];
  }
  const marker = /argTypes\s*:\s*\{/.exec(storyText);
  if (marker === null) return [];
  const open = storyText.indexOf('{', (marker.index ?? 0) + marker[0].length - 1);
  const { entries } = objectEntries(storyText, open);
  const lookup = constantResolver(componentSourceText);

  const props: PropDescriptor[] = [];
  for (const entry of entries) {
    if (NON_PROP_KEYS.has(entry.key) || !entry.value.trim().startsWith('{')) continue;
    const parsed = propFrom(objectEntries(entry.value.trim(), 0).entries, lookup);
    if (parsed === undefined) continue;
    props.push({ ...parsed, name: entry.key });
  }
  return props;
}

/** Convenience wrapper: the story beside a component source, if one exists. */
export async function readStoryPropsForId(id: string): Promise<{ props: readonly PropDescriptor[]; storyPath: string } | undefined> {
  const storyPath = join(uiSourceRoot, `${id}.stories.tsx`);
  let componentText = '';
  try {
    componentText = await readFile(join(uiSourceRoot, `${id}.tsx`), 'utf8');
  } catch {
    // A component without a source file has nothing to resolve constants from.
  }
  const props = await readStoryProps(storyPath, componentText);
  return props.length > 0 ? { props, storyPath } : undefined;
}
