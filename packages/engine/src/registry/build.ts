/**
 * Pure builders for shadcn-compatible registry JSON. Another agent feeds real `ui`
 * sources through these later; nothing here reads the filesystem or mutates input —
 * given a descriptor + file list + deps, it produces the registry object and nothing
 * else. Output key order is fixed so artifacts are byte-stable.
 */
import type { RegistryFile, RegistryFileType, RegistryIndex, RegistryIndexItem, RegistryItem, RegistryItemType } from './types.js';

export interface RegistryItemDescriptor {
  readonly name: string;
  readonly type: RegistryItemType;
  readonly title?: string;
  readonly description?: string;
  readonly homepage?: string;
  readonly meta?: Readonly<Record<string, unknown>>;
}

export interface RegistryFileInput {
  readonly path: string;
  readonly type?: RegistryFileType;
  readonly contents?: string;
}

export interface RegistryDependencies {
  readonly dependencies?: readonly string[];
  readonly devDependencies?: readonly string[];
  readonly registryDependencies?: readonly string[];
}

/** Sort + de-duplicate a string list, dropping empties, for deterministic output. */
function normalizeList(list: readonly string[] | undefined): string[] | undefined {
  if (list === undefined || list.length === 0) return undefined;
  return [...new Set(list.filter((s) => s.length > 0))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Build a single `registry.json` item. Files default to type `registry:component`
 * when unspecified.
 */
export function buildRegistryItem(
  descriptor: RegistryItemDescriptor,
  files: readonly RegistryFileInput[],
  deps: RegistryDependencies = {},
): RegistryItem {
  const builtFiles: RegistryFile[] = files.map((f) => {
    const type = f.type ?? 'registry:component';
    const file: Record<string, unknown> = { type, path: f.path };
    if (f.contents !== undefined) file['contents'] = f.contents;
    return file as unknown as RegistryFile;
  });

  const dependencies = normalizeList(deps.dependencies);
  const devDependencies = normalizeList(deps.devDependencies);
  const registryDependencies = normalizeList(deps.registryDependencies);

  const item: Record<string, unknown> = { name: descriptor.name, type: descriptor.type };
  if (descriptor.title !== undefined) item['title'] = descriptor.title;
  if (descriptor.description !== undefined) item['description'] = descriptor.description;
  if (descriptor.homepage !== undefined) item['homepage'] = descriptor.homepage;
  if (dependencies !== undefined) item['dependencies'] = dependencies;
  if (devDependencies !== undefined) item['devDependencies'] = devDependencies;
  if (registryDependencies !== undefined) item['registryDependencies'] = registryDependencies;
  if (builtFiles.length > 0) item['files'] = builtFiles;
  if (descriptor.meta !== undefined) item['meta'] = descriptor.meta;
  return item as unknown as RegistryItem;
}

/**
 * Build the registry index (`registry.json`) from a set of items. The index lists a
 * lean entry per item; order is preserved from input.
 */
export function buildRegistryIndex(
  items: readonly RegistryItem[],
  options: { readonly name?: string; readonly homepage?: string } = {},
): RegistryIndex {
  const indexItems: RegistryIndexItem[] = items.map((item) => {
    const lean: Record<string, unknown> = { name: item.name, type: item.type };
    if (item.title !== undefined) lean['title'] = item.title;
    if (item.description !== undefined) lean['description'] = item.description;
    if (item.registryDependencies !== undefined) lean['registryDependencies'] = [...item.registryDependencies];
    return lean as unknown as RegistryIndexItem;
  });

  const index: Record<string, unknown> = {};
  if (options.name !== undefined) index['name'] = options.name;
  if (options.homepage !== undefined) index['homepage'] = options.homepage;
  index['items'] = indexItems;
  index['totalItems'] = indexItems.length;
  return index as unknown as RegistryIndex;
}
