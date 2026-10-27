/**
 * In-code shadcn Registry schema validation.
 *
 * The registry is a *distribution protocol*: if an emitted document is not exactly
 * what `npx shadcn add <url>` expects, the failure surfaces in someone else's
 * terminal weeks later. So every document this package writes is checked here before
 * it is allowed to land on disk, and the build fails on any violation.
 *
 * The shape enforced is the public schema at https://ui.shadcn.com/schema/registry.json
 * (index) and https://ui.shadcn.com/schema/registry-item.json (item), narrowed to the
 * subset the harness emits:
 *
 *   index : { name?, homepage?, items: [ { name, type, … } ], totalItems }
 *   item  : { name, type, files: [ { path, type, content } ], dependencies?,
 *             devDependencies?, registryDependencies?, title?, description?, homepage?, meta? }
 *
 * Two deliberate decisions, recorded here rather than in a comment at the call site:
 *
 * 1. the payload key is `files[].content`. The official schema names it `content`;
 *    `@designharness/engine`'s builder keeps the internal name `contents`, so
 *    `build.ts` performs that one documented rename.
 * 2. there is no `registry:css` file type in the schema. Stylesheets are distributed as
 *    `registry:style` (code) or `registry:file` (verbatim copy), which is what shadcn's
 *    own theme registries do.
 */
import type { RegistryIndex } from '@designharness/engine';

/** Item `type` values accepted by the official schema. */
export const SHADCN_REGISTRY_ITEM_TYPES: readonly string[] = [
  'registry:base',
  'registry:bit',
  'registry:block',
  'registry:component',
  'registry:content',
  'registry:example',
  'registry:file',
  'registry:font',
  'registry:hook',
  'registry:item',
  'registry:lib',
  'registry:page',
  'registry:style',
  'registry:theme',
  'registry:ui',
];

/** `files[].type` values accepted by the official schema (same enum as item types). */
export const SHADCN_REGISTRY_FILE_TYPES: readonly string[] = SHADCN_REGISTRY_ITEM_TYPES;

/** Top-level keys the index may carry. Anything else is a build error, not a warning. */
const INDEX_KEYS = new Set(['$schema', 'name', 'description', 'homepage', 'items', 'totalItems', 'include']);
/** Top-level keys an item may carry. */
const ITEM_KEYS = new Set([
  '$schema',
  'name',
  'type',
  'title',
  'description',
  'homepage',
  'url',
  'dependencies',
  'devDependencies',
  'registryDependencies',
  'files',
  'meta',
  'emoji',
  'author',
  'category',
]);
/** Keys a `files[]` entry may carry. */
const FILE_KEYS = new Set(['path', 'type', 'content', 'target']);

/** Registry item documents are emitted with the spec's `content` key, so they are
 *  structurally the engine's `RegistryItem` with the file payload renamed. */
export interface RegistryFileDocument {
  readonly path: string;
  readonly type: string;
  readonly content: string;
  readonly target?: string;
}

export interface RegistryItemDocument {
  readonly name: string;
  readonly type: string;
  readonly title?: string;
  readonly description?: string;
  readonly homepage?: string;
  readonly dependencies?: readonly string[];
  readonly devDependencies?: readonly string[];
  readonly registryDependencies?: readonly string[];
  readonly files?: readonly RegistryFileDocument[];
  readonly meta?: Readonly<Record<string, unknown>>;
}

/** One schema violation: where it is, what is wrong. */
export interface ValidationIssue {
  readonly location: string;
  readonly message: string;
}

/** Raised by the builders when a document would be written that shadcn cannot read. */
export class RegistrySchemaError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(heading: string, issues: readonly ValidationIssue[]) {
    const detail = issues.map((issue) => `  - ${issue.location}: ${issue.message}`).join('\n');
    super(`${heading}\n${detail}`);
    this.name = 'RegistrySchemaError';
    this.issues = issues;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/** kebab-case item names: they become URLs (`/r/<name>.json`) and file stems. */
const ITEM_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** npm package names (and the registry aliases `@scope/name@version` allow). */
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(?:@[A-Za-z0-9^.~*_/-]+)?$/;

function checkStringList(
  issues: ValidationIssue[],
  location: string,
  key: string,
  value: unknown,
  pattern: RegExp,
  label: string,
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    issues.push({ location: `${location}.${key}`, message: `must be an array of ${label}, found ${typeof value}` });
    return;
  }
  value.forEach((entry, index) => {
    const at = `${location}.${key}[${String(index)}]`;
    if (!isNonEmptyString(entry)) {
      issues.push({ location: at, message: `must be a non-empty ${label}` });
      return;
    }
    if (!pattern.test(entry)) issues.push({ location: at, message: `is not a valid ${label}: "${entry}"` });
    if (entry.startsWith('http://') || entry.startsWith('https://')) {
      issues.push({ location: at, message: 'remote URLs are not emitted by this build; names are resolved against this registry' });
    }
  });
}

function checkUnknownKeys(issues: ValidationIssue[], location: string, keys: Set<string>, value: Record<string, unknown>): void {
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) issues.push({ location: `${location}.${key}`, message: 'unknown key for the shadcn schema' });
  }
}

/** Validate one registry item document. Returns the issue list; empty means valid. */
export function validateRegistryItem(item: unknown, location = 'item'): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isRecord(item)) {
    return [{ location, message: `must be an object, found ${Array.isArray(item) ? 'array' : typeof item}` }];
  }

  checkUnknownKeys(issues, location, ITEM_KEYS, item);

  if (!isNonEmptyString(item['name'])) issues.push({ location: `${location}.name`, message: 'required non-empty string' });
  else if (!ITEM_NAME.test(item['name'])) {
    issues.push({ location: `${location}.name`, message: `must be kebab-case (matches ${ITEM_NAME.source}), found "${item['name']}"` });
  }

  const type = item['type'];
  if (!isNonEmptyString(type)) issues.push({ location: `${location}.type`, message: 'required non-empty string' });
  else if (!SHADCN_REGISTRY_ITEM_TYPES.includes(type)) {
    issues.push({ location: `${location}.type`, message: `"${type}" is not one of ${SHADCN_REGISTRY_ITEM_TYPES.join(', ')}` });
  }

  for (const key of ['title', 'description', 'homepage', 'url', 'emoji', 'author'] as const) {
    const value = item[key];
    if (value !== undefined && typeof value !== 'string') {
      issues.push({ location: `${location}.${key}`, message: `must be a string when present, found ${typeof value}` });
    }
  }

  checkStringList(issues, location, 'dependencies', item['dependencies'], PACKAGE_NAME, 'npm dependency');
  checkStringList(issues, location, 'devDependencies', item['devDependencies'], PACKAGE_NAME, 'npm dependency');
  checkStringList(issues, location, 'registryDependencies', item['registryDependencies'], ITEM_NAME, 'registry item name');

  if (item['meta'] !== undefined && !isRecord(item['meta'])) {
    issues.push({ location: `${location}.meta`, message: 'must be an object when present' });
  }

  const files = item['files'];
  if (files === undefined) {
    issues.push({ location: `${location}.files`, message: 'every harness item must distribute at least one file' });
    return issues;
  }
  if (!Array.isArray(files)) {
    issues.push({ location: `${location}.files`, message: 'must be an array' });
    return issues;
  }
  if (files.length === 0) issues.push({ location: `${location}.files`, message: 'must not be empty' });

  files.forEach((file: unknown, index) => {
    const at = `${location}.files[${String(index)}]`;
    if (!isRecord(file)) {
      issues.push({ location: at, message: 'must be an object' });
      return;
    }
    checkUnknownKeys(issues, at, FILE_KEYS, file);
    if (!isNonEmptyString(file['path'])) issues.push({ location: `${at}.path`, message: 'required non-empty string' });
    else {
      const path = file['path'];
      if (path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(path)) {
        issues.push({ location: `${at}.path`, message: `must be project-relative, found absolute "${path}"` });
      }
      if (path.split(/[\\/]/).includes('..')) {
        issues.push({ location: `${at}.path`, message: `must not traverse outside the project: "${path}"` });
      }
      if (/^src\//.test(path)) {
        issues.push({ location: `${at}.path`, message: `must not assume the consumer's source directory: "${path}"` });
      }
    }
    const fileType = file['type'];
    if (!isNonEmptyString(fileType)) issues.push({ location: `${at}.type`, message: 'required non-empty string' });
    else if (!SHADCN_REGISTRY_FILE_TYPES.includes(fileType)) {
      issues.push({ location: `${at}.type`, message: `"${fileType}" is not one of ${SHADCN_REGISTRY_FILE_TYPES.join(', ')}` });
    }
    if (fileType === 'registry:css') issues.push({ location: `${at}.type`, message: 'registry:css is not a schema value; use registry:style' });
    if (file['target'] !== undefined && typeof file['target'] !== 'string') {
      issues.push({ location: `${at}.target`, message: 'must be a string when present' });
    }
    const content = file['content'];
    if (typeof content !== 'string') {
      issues.push({
        location: `${at}.content`,
        message:
          content === undefined
            ? 'required string payload is missing (the engine builder writes the internal key "contents"; build.ts renames it)'
            : `required string payload, found ${typeof content}`,
      });
    } else if (content.trim().length === 0) {
      issues.push({ location: `${at}.content`, message: 'must not be empty: an empty file is indistinguishable from a placeholder' });
    }
  });

  return issues;
}

/** Validate the `registry.json` index document. */
export function validateRegistryIndex(index: unknown, location = 'registry.json'): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isRecord(index)) {
    return [{ location, message: `must be an object, found ${Array.isArray(index) ? 'array' : typeof index}` }];
  }

  checkUnknownKeys(issues, location, INDEX_KEYS, index);

  for (const key of ['name', 'description', 'homepage', '$schema'] as const) {
    const value = index[key];
    if (value !== undefined && typeof value !== 'string') {
      issues.push({ location: `${location}.${key}`, message: `must be a string when present, found ${typeof value}` });
    }
  }

  const items = index['items'];
  if (!Array.isArray(items)) {
    issues.push({ location: `${location}.items`, message: 'required array (the schema needs items or include)' });
    return issues;
  }
  if (items.length === 0) issues.push({ location: `${location}.items`, message: 'must not be empty' });

  const totalItems = index['totalItems'];
  if (typeof totalItems !== 'number') {
    issues.push({ location: `${location}.totalItems`, message: 'required number' });
  } else if (totalItems !== items.length) {
    issues.push({ location: `${location}.totalItems`, message: `must equal items.length (${String(items.length)}), found ${String(totalItems)}` });
  }

  const seen = new Set<string>();
  items.forEach((entry: unknown, index_: number) => {
    const at = `${location}.items[${String(index_)}]`;
    if (!isRecord(entry)) {
      issues.push({ location: at, message: 'must be an object' });
      return;
    }
    if (!isNonEmptyString(entry['name'])) issues.push({ location: `${at}.name`, message: 'required non-empty string' });
    else {
      if (!ITEM_NAME.test(entry['name'])) issues.push({ location: `${at}.name`, message: `must be kebab-case, found "${entry['name']}"` });
      if (seen.has(entry['name'])) issues.push({ location: `${at}.name`, message: `duplicate item name "${entry['name']}"` });
      seen.add(entry['name']);
    }
    if (!isNonEmptyString(entry['type']) || !SHADCN_REGISTRY_ITEM_TYPES.includes(String(entry['type']))) {
      issues.push({ location: `${at}.type`, message: `must be one of ${SHADCN_REGISTRY_ITEM_TYPES.join(', ')}` });
    }
    checkStringList(issues, at, 'registryDependencies', entry['registryDependencies'], ITEM_NAME, 'registry item name');
    for (const key of ['title', 'description', 'url'] as const) {
      const value = entry[key];
      if (value !== undefined && typeof value !== 'string') {
        issues.push({ location: `${at}.${key}`, message: `must be a string when present, found ${typeof value}` });
      }
    }
  });

  return issues;
}

/**
 * Cross-document checks the per-document validators cannot make: every
 * `registryDependencies` name must resolve inside this registry (that is exactly what
 * `npx shadcn add` tries to do), and every index entry must have a payload document.
 */
export function validateRegistrySet(index: RegistryIndex, items: readonly RegistryItemDocument[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const names = new Set(items.map((item) => item.name));
  const indexNames = new Set(index.items.map((item) => item.name));

  for (const name of indexNames) {
    if (!names.has(name)) issues.push({ location: 'registry.json', message: `index lists "${name}" but no r/${name}.json is emitted` });
  }
  for (const name of names) {
    if (!indexNames.has(name)) issues.push({ location: 'registry.json', message: `r/${name}.json exists but the index does not list it` });
  }

  for (const item of items) {
    for (const dependency of item.registryDependencies ?? []) {
      if (!names.has(dependency)) {
        issues.push({ location: `r/${item.name}.json`, message: `registryDependencies "${dependency}" does not resolve inside this registry` });
      }
      if (dependency === item.name) {
        issues.push({ location: `r/${item.name}.json`, message: 'item depends on itself' });
      }
    }
  }

  return issues;
}

/** Throw unless every document of a built registry is schema-clean. */
export function assertRegistryDocuments(index: RegistryIndex, items: readonly RegistryItemDocument[]): void {
  const issues = [
    ...validateRegistryIndex(index),
    ...items.flatMap((item) => validateRegistryItem(item, `r/${String(item.name)}.json`)),
    ...validateRegistrySet(index, items),
  ];
  if (issues.length > 0) throw new RegistrySchemaError(`registry output violates the shadcn schema (${String(issues.length)} issues)`, issues);
}
