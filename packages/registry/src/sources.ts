/**
 * Reads the *real* component sources out of `packages/ui/src` and derives everything a
 * registry item needs: the file payloads (verbatim source text), the npm dependencies,
 * the shared lib files, the inter-component edges and the token references a stylesheet
 * makes. Nothing in this module hardcodes a package list or a file list — if `ui` gains
 * a component or starts importing a second helper, the registry picks it up from disk.
 *
 * This is what makes the distribution honest rather than a manifest of intentions: the
 * bytes shipped to `npx shadcn add` are the bytes on disk, byte for byte.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { uiSourceRoot, toRelative } from './paths.js';

/** Bare specifiers that are provided by the runtime, not by an npm install. */
const NODE_BUILTINS = new Set(['fs', 'path', 'os', 'url', 'util', 'events', 'stream', 'crypto', 'http', 'https', 'net', 'zlib']);

/** A single file the registry ships to a consuming project. */
export interface SourceFile {
  /** Absolute path inside this workspace. */
  readonly absolutePath: string;
  /** Repository-relative POSIX path, for reports and `meta`. */
  readonly sourcePath: string;
  /** Destination path inside the consuming project (project-relative, no `src/`). */
  readonly destinationPath: string;
  /** Verbatim file text. */
  readonly content: string;
  readonly sha256: string;
  readonly bytes: number;
}

/** One component discovered in `packages/ui/src`. */
export interface ComponentSource {
  /** Registry / MCP / metadata id (TOKEN-API.md §6). */
  readonly id: string;
  /** Public export name of the component, e.g. `DataTable`. */
  readonly displayName: string;
  readonly entry: SourceFile;
  /** Per-component stylesheet, when the styled layer ships one. */
  readonly stylesheet: SourceFile | undefined;
  /** Shared sources the component imports relatively (`./internal/classnames.js`). */
  readonly shared: readonly SourceFile[];
  /** npm packages the shipped sources import. */
  readonly npmDependencies: readonly string[];
  /** Other registry component ids this component imports directly. */
  readonly dependsOnComponents: readonly string[];
  /** `--token` names referenced by the component's own stylesheet. */
  readonly tokenReferences: readonly string[];
  readonly hasStories: boolean;
  readonly storiesPath: string | undefined;
}

/** The authored stylesheet the `registry:style` item flattens. */
export interface StyleBundle {
  readonly barrel: SourceFile;
  readonly parts: readonly SourceFile[];
  /** The barrel with every `@import './styles/x.css'` replaced by that file's text. */
  readonly flattened: string;
  readonly tokenReferences: readonly string[];
}

export const sha256Of = (text: string): string => createHash('sha256').update(text).digest('hex');

async function readSource(absolutePath: string, destinationPath: string): Promise<SourceFile> {
  const content = await readFile(absolutePath, 'utf8');
  return {
    absolutePath,
    sourcePath: toRelative(absolutePath),
    destinationPath,
    content,
    sha256: sha256Of(content),
    bytes: Buffer.byteLength(content),
  };
}

/** `import … from 'x'` / `export … from 'x'` specifiers, in source order. */
function moduleSpecifiers(text: string): string[] {
  const found: string[] = [];
  const pattern = /(?:from|import)\s*['"]([^'"]+)['"]/g;
  for (const match of text.matchAll(pattern)) {
    const specifier = match[1];
    if (specifier !== undefined) found.push(specifier);
  }
  return found;
}

/** Bare specifier → package name (`@scope/pkg/sub` → `@scope/pkg`); `undefined` for relative/builtin. */
function packageNameOf(specifier: string): string | undefined {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('#')) return undefined;
  const [withoutQuery] = specifier.split('?');
  const parts = (withoutQuery ?? specifier).split('/');
  const pkg = specifier.startsWith('@') ? `${parts[0]}/${parts[1] ?? ''}` : parts[0];
  if (pkg === undefined || pkg.length === 0 || NODE_BUILTINS.has(pkg)) return undefined;
  return pkg;
}

/** kebab-case a component file stem: `data-table` stays, `DataTable` → `data-table`. */
function idFromFileName(fileName: string): string {
  return basename(fileName)
    .replace(/\.(?:tsx|ts)$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

/** Every top-level component source in `packages/ui/src` (no stories, no barrels). */
async function discoverComponentFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tsx') && !entry.name.endsWith('.stories.tsx'))
    .map((entry) => join(root, entry.name))
    .sort();
  if (files.length === 0) {
    throw new Error(
      `no component sources found in ${root}: @designharness/ui has not been authored yet, so there is nothing to distribute`,
    );
  }
  return files;
}

/** Resolve a relative module specifier (`./internal/classnames.js`) to the file on disk. */
async function resolveRelativeModule(fromFile: string, specifier: string): Promise<string | undefined> {
  const base = join(dirname(fromFile), specifier.replace(/\.(?:js|jsx|mjs|cjs)$/, ''));
  for (const extension of ['.ts', '.tsx']) {
    const candidate = `${base}${extension}`;
    if (existsSync(candidate)) return candidate;
  }
  for (const extension of ['.ts', '.tsx']) {
    const candidate = join(base, `index${extension}`);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/** Destination layout shipped to a consuming project. */
const COMPONENTS_DIR = 'components/designharness';
const STYLES_DIR = 'styles/designharness';

/**
 * Destination for a source file. The `styles/` directory is flattened into
 * `styles/designharness/` — the entry stylesheet the style item generates imports its
 * sheets by basename, so a nested `styles/styles/` directory would dangle.
 */
function destinationFor(absolutePath: string, root: string): string {
  const relative = toRelative(absolutePath);
  const insideRoot = toRelative(root);
  const tail = relative.startsWith(`${insideRoot}/`) ? relative.slice(insideRoot.length + 1) : basename(absolutePath);
  if (tail.startsWith('internal/')) return `${COMPONENTS_DIR}/${tail}`;
  if (tail.startsWith('styles/')) return `${STYLES_DIR}/${basename(tail)}`;
  return `${COMPONENTS_DIR}/${tail}`;
}

/** Every `var(--token)` name referenced by a stylesheet, sorted and de-duplicated. */
export function tokenReferences(cssText: string): string[] {
  const names = new Set<string>();
  for (const match of cssText.matchAll(/var\(\s*--([A-Za-z0-9-]+)/g)) {
    const name = match[1];
    if (name !== undefined) names.add(`--${name}`);
  }
  return [...names].sort((a, b) => (a < b ? -1 : 1));
}

/**
 * Build the full source picture for every component under `packages/ui/src`.
 *
 * @throws when the ui sources or the token stylesheet barrel are missing — the registry
 *   refuses to emit a document it cannot back with real bytes.
 */
export async function collectComponentSources(root: string = uiSourceRoot): Promise<{
  components: ComponentSource[];
  styles: StyleBundle;
}> {
  const entryFiles = await discoverComponentFiles(root);
  const ids = entryFiles.map((file) => idFromFileName(file));

  const components: ComponentSource[] = [];
  /** Shared helpers keyed by absolute path so one helper is read once but shipped per item. */
  const sharedCache = new Map<string, SourceFile>();

  for (const entryFile of entryFiles) {
    const id = idFromFileName(entryFile);
    const entryText = await readFile(entryFile, 'utf8');
    const entry = await readSource(entryFile, destinationFor(entryFile, root));

    const sharedPaths: string[] = [];
    const siblingIds: string[] = [];
    const npm = new Set<string>();

    for (const specifier of moduleSpecifiers(entryText)) {
      const pkg = packageNameOf(specifier);
      if (pkg !== undefined) {
        npm.add(pkg);
        continue;
      }
      if (!specifier.startsWith('.')) continue;
      const target = await resolveRelativeModule(entryFile, specifier);
      if (target === undefined) {
        throw new Error(`${toRelative(entryFile)} imports "${specifier}", which does not resolve inside ${toRelative(root)}`);
      }
      const targetId = idFromFileName(target);
      if (targetId !== id && ids.includes(targetId)) {
        siblingIds.push(targetId);
        continue;
      }
      if (targetId === id) continue; // the component's own module graph re-entry
      sharedPaths.push(target);
    }

    const shared: SourceFile[] = [];
    for (const path of [...new Set(sharedPaths)].sort()) {
      const cached = sharedCache.get(path);
      if (cached !== undefined) {
        shared.push(cached);
        continue;
      }
      const text = await readFile(path, 'utf8');
      // A shared source is shipped next to the component that imports it, so its own
      // relative imports keep resolving in the consuming project.
      const built = await readSource(path, destinationFor(path, root));
      sharedCache.set(path, built);
      shared.push(built);
      for (const specifier of moduleSpecifiers(text)) {
        const pkg = packageNameOf(specifier);
        if (pkg !== undefined) npm.add(pkg);
      }
    }

    const stylesheetPath = join(root, 'styles', `${id}.css`);
    const stylesheet = existsSync(stylesheetPath)
      ? await readSource(stylesheetPath, destinationFor(stylesheetPath, root))
      : undefined;

    const storiesPath = join(root, `${basename(entryFile, '.tsx')}.stories.tsx`);
    const hasStories = existsSync(storiesPath);

    // `Dialog` is the public name the barrel re-exports; take it from the source rather
    // than inventing it: the first `export const <Name>:` / `export function <Name>(`
    // whose stem matches the component.
    const displayName = exportedComponentName(entryText, id) ?? toPublicName(id);

    components.push({
      id,
      displayName,
      entry,
      stylesheet,
      shared,
      npmDependencies: [...npm].sort((a, b) => (a < b ? -1 : 1)),
      dependsOnComponents: [...new Set(siblingIds)].sort((a, b) => (a < b ? -1 : 1)),
      tokenReferences: stylesheet === undefined ? [] : tokenReferences(stylesheet.content),
      hasStories,
      storiesPath: hasStories ? toRelative(storiesPath) : undefined,
    });
  }

  const styles = await buildStyleBundle(root);
  components.sort((a, b) => (a.id < b.id ? -1 : 1));
  return { components, styles };
}

/** The public PascalCase name for a kebab id (`data-table` → `DataTable`). */
export function toPublicName(id: string): string {
  return id.split('-').map((part) => `${(part[0] ?? '').toUpperCase()}${part.slice(1)}`).join('');
}

/**
 * Find the aggregate component export in a source file. The ui layer names its
 * components `<Pascal>` (plus `UI<Pascal>` / `<Pascal>Root` aliases), so the aggregate
 * is the shortest matching exported name.
 */
function exportedComponentName(text: string, id: string): string | undefined {
  const publicName = toPublicName(id);
  const names = new Set<string>();
  for (const match of text.matchAll(/export\s+(?:const|function|class)\s+([A-Z][A-Za-z0-9]*)/g)) {
    const name = match[1];
    if (name !== undefined) names.add(name);
  }
  for (const match of text.matchAll(/export\s*\{([^}]*)\}/g)) {
    const body = match[1] ?? '';
    for (const chunk of body.split(',')) {
      const asMatch = /(?:^|\s)([A-Za-z0-9_]+)\s+as\s+([A-Za-z0-9_]+)/.exec(chunk);
      const candidate = (asMatch?.[2] ?? /^\s*([A-Za-z0-9_]+)/.exec(chunk)?.[1]) ?? '';
      if (/^[A-Z]/.test(candidate)) names.add(candidate);
    }
  }
  const matching = [...names].filter((name) => name === publicName || name === `UI${publicName}`);
  if (matching.length > 0) return matching.sort((a, b) => a.length - b.length)[0];
  const short = [...names].filter((name) => !name.endsWith('Root') && !name.startsWith('UI')).sort((a, b) => a.length - b.length);
  return short[0];
}

/**
 * Resolve the ui stylesheet barrel into one self-contained document: every
 * `@import './styles/x.css'` is replaced by that file's verbatim text. The barrel's own
 * prose, its `@layer` statement and the source order of the imports are preserved — a
 * consuming project gets exactly what `@designharness/ui/styles.css` gives this repo,
 * without a relative path that could dangle.
 */
async function buildStyleBundle(root: string): Promise<StyleBundle> {
  const barrelPath = join(root, 'styles.css');
  if (!existsSync(barrelPath)) {
    throw new Error(`the ui stylesheet barrel is missing: ${toRelative(barrelPath)}`);
  }
  const barrel = await readSource(barrelPath, `${STYLES_DIR}/styles.css`);
  const importPattern = /^@import\s+'(\.\/styles\/[^']+)';\s*$/gm;
  const imports = [...barrel.content.matchAll(importPattern)].map((match) => match[1]).filter((value): value is string => value !== undefined);
  if (imports.length === 0) throw new Error(`${toRelative(barrelPath)} declares no ./styles/*.css imports; cannot flatten`);

  const parts: SourceFile[] = [];
  let flattened = barrel.content;
  for (const specifier of imports) {
    const absolute = join(root, specifier.replace('./', ''));
    if (!existsSync(absolute)) throw new Error(`${toRelative(barrelPath)} imports "${specifier}", which does not exist`);
    const part = await readSource(absolute, `${STYLES_DIR}/${basename(absolute)}`);
    if (/@import\s/.test(part.content)) throw new Error(`${part.sourcePath} nests an @import; the flattener only resolves one level`);
    parts.push(part);
    flattened = flattened.replace(new RegExp(`@import\\s+'${specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}';`), () => part.content.trimEnd());
  }

  const authored = (await readdir(join(root, 'styles'))).filter((name) => name.endsWith('.css')).sort();
  const unimported = authored.filter((name) => !imports.some((specifier) => specifier.endsWith(name)));
  if (unimported.length > 0) {
    throw new Error(`authored CSS is missing from ${toRelative(barrelPath)}: ${unimported.join(', ')}`);
  }

  return {
    barrel,
    parts,
    flattened: `${flattened.replace(/\n{3,}/g, '\n\n').trimEnd()}\n`,
    tokenReferences: tokenReferences(flattened),
  };
}

/** Exported so the server and tests can reuse the same destination layout. */
export const registryDestinations = { componentsDir: COMPONENTS_DIR, stylesDir: STYLES_DIR };
