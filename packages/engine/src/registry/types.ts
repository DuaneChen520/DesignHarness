/**
 * shadcn Registry types (subset) — see https://ui.shadcn.com/schema/registry.json.
 * The harness only produces `registry:component`, `registry:base` and
 * `registry:style` items and their index.
 */

export type RegistryItemType = 'registry:component' | 'registry:base' | 'registry:style' | 'registry:lib' | 'registry:hook';

export type RegistryFileType =
  | 'registry:page'
  | 'registry:file'
  | 'registry:component'
  | 'registry:ui'
  | 'registry:lib'
  | 'registry:hook'
  | 'registry:style';

export interface RegistryFile {
  readonly path: string;
  readonly type: RegistryFileType;
  readonly contents?: string;
}

export interface RegistryItem {
  readonly name: string;
  readonly type: RegistryItemType;
  readonly title?: string;
  readonly description?: string;
  readonly homepage?: string;
  readonly dependencies?: readonly string[];
  readonly devDependencies?: readonly string[];
  readonly registryDependencies?: readonly string[];
  readonly files?: readonly RegistryFile[];
  readonly meta?: Readonly<Record<string, unknown>>;
}

export interface RegistryIndexItem {
  readonly name: string;
  readonly type: RegistryItemType;
  readonly title?: string;
  readonly description?: string;
  readonly registryDependencies?: readonly string[];
}

export interface RegistryIndex {
  readonly name?: string;
  readonly homepage?: string;
  readonly items: readonly RegistryIndexItem[];
  readonly totalItems: number;
}
