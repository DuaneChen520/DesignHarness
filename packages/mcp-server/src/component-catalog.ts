/**
 * The component catalogue behind `list_components`.
 *
 * Every field is read from a build artifact or a source file at call time — there is no
 * list of components in this file:
 *
 *   registry name  — the frozen id rule of TOKEN-API.md §6 (component ids are the item
 *                    names), cross-checked against `packages/registry/registry.json`
 *                    when the registry has been built;
 *   prop count     — `packages/contracts/generated/component-metadata.json`, else the
 *                    built registry item's `meta`, else a live `extractComponentMetadata`
 *                    run over `packages/ui/src`;
 *   a11y status    — the Tier-3 axe-core report when one exists, plus the WCAG 2.2 AA
 *                    contrast audit recorded in the compiled token artifact for the colour
 *                    tokens the component's own stylesheet paints with.
 *
 * `status` is `reviewed` only when all of that is in place; a component the gates have
 * not measured yet is reported as `provisional`, which is the truth rather than a badge.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { extractComponentMetadata } from '@designharness/engine';
import { contrastPairs, tierOf } from '@designharness/tokens';
import { builtRegistryDir, contractsMetadataPath, toRelative, uiSourceRoot, workspaceRoot, designMarkdownPath } from './workspace.js';

export type ComponentStatus = 'reviewed' | 'provisional' | 'blocked';

/** Structural guard for JSON.parse output — used by every catalog reader below. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Normalise a parsed JSON document into `[id, record]` pairs, accepting both the
 * `{ components: { id: … } }` map shape and the `[{ id: … }]` array shape that the
 * metadata and axe-report producers emit.
 */
export function toEntries(value: unknown): [string, Record<string, unknown>][] {
  if (Array.isArray(value)) {
    return value
      .filter(isRecord)
      .map((record) => [String(record['id'] ?? record['componentId'] ?? record['component'] ?? ''), record]);
  }
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, inner]) => (isRecord(inner) ? [[key, inner] as [string, Record<string, unknown>]] : []));
  }
  return [];
}

export interface ComponentA11y {
  readonly gate: 3;
  readonly standard: 'WCAG 2.2 AA';
  readonly engine: 'axe-core';
  /** The axe-core layer: `not-run` until the showcase gate publishes a report. */
  readonly axe: { readonly status: 'passed' | 'failed' | 'not-run'; readonly evidence: string; readonly violations: number; readonly incomplete: number };
  /** The measured contrast layer, always available from the compiled artifact. */
  readonly contrast: { readonly audited: number; readonly failures: number; readonly pairs: readonly string[] };
  readonly status: 'verified' | 'provisional' | 'blocked';
  readonly reasons: readonly string[];
}

export interface CatalogComponent {
  readonly id: string;
  readonly name: string;
  readonly registryName: string;
  readonly registryType: 'registry:component';
  readonly status: ComponentStatus;
  readonly propCount: number;
  readonly requiredPropCount: number;
  readonly eventCount: number;
  readonly props: readonly { readonly name: string; readonly type: string; readonly required: boolean; readonly default?: string; readonly description?: string }[];
  readonly metadata: { readonly provenance: 'contracts-metadata' | 'built-registry' | 'engine-extraction' | 'unresolved'; readonly source: string };
  readonly files: { readonly source: string; readonly stylesheet: string | null; readonly stories: string | null; readonly sha256: string };
  readonly tokens: { readonly referenced: number; readonly cssVariables: readonly string[] };
  readonly a11y: ComponentA11y;
  readonly distributedInRegistry: boolean;
}

export interface Catalog {
  readonly components: readonly CatalogComponent[];
  readonly intent: { readonly file: string; readonly sha256: string };
  readonly registry: { readonly built: boolean; readonly index: string | null; readonly items: readonly string[] };
}

/** Where the Tier-3 axe-core report is expected; `DESIGNHARNESS_A11Y_REPORT` wins. */
export const AXE_REPORT_CANDIDATES: readonly string[] = [
  process.env['DESIGNHARNESS_A11Y_REPORT'] ?? '',
  join(workspaceRoot, 'apps', 'showcase', 'reports', 'a11y.json'),
  join(workspaceRoot, 'apps', 'showcase', 'test-results', 'a11y.json'),
  join(workspaceRoot, 'packages', 'ui', 'reports', 'a11y.json'),
].filter((path) => path.length > 0);

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

/** kebab id from a ui source stem: `data-table.tsx` → `data-table`. */
function idOf(fileName: string): string {
  return basename(fileName)
    .replace(/\.(?:tsx|ts)$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

/** PascalCase display name derived from the id, e.g. `data-table` → `DataTable`. */
function displayName(id: string): string {
  return id
    .split('-')
    .map((part) => `${(part[0] ?? '').toUpperCase()}${part.slice(1)}`)
    .join('');
}

/** Every component source in `packages/ui/src` (stories, barrels and helpers are not components). */
async function discoverComponents(): Promise<string[]> {
  if (!existsSync(uiSourceRoot)) {
    throw new Error(`${toRelative(uiSourceRoot)} does not exist: @designharness/ui has not been authored, so there are no components to list`);
  }
  const entries = await readdir(uiSourceRoot, { withFileTypes: true });
  const ids = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tsx') && !entry.name.endsWith('.stories.tsx'))
    .map((entry) => idOf(entry.name))
    .sort();
  if (ids.length === 0) throw new Error(`no component sources found in ${toRelative(uiSourceRoot)}`);
  return ids;
}

interface PropRow {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly default?: string;
  readonly description?: string;
}

/** The AST flattens every inherited DOM attribute; only authored props are reported. */
function authoredOnly(props: readonly PropRow[]): PropRow[] {
  return props.filter((prop) => prop.required || prop.description !== undefined || prop.default !== undefined);
}

async function fromContractsArtifact(ids: readonly string[]): Promise<Map<string, { props: PropRow[]; events: number; source: string }>> {
  const out = new Map<string, { props: PropRow[]; events: number; source: string }>();
  if (!existsSync(contractsMetadataPath)) return out;
  const parsed = JSON.parse(await readFile(contractsMetadataPath, 'utf8')) as unknown;
  const entries = toEntries(parsed);

  for (const [id, record] of entries) {
    if (id.length === 0 || !ids.includes(id)) continue;
    const raw = Array.isArray(record['props']) ? record['props'] : [];
    const props = authoredOnly(
      raw
        .filter((prop): prop is Record<string, unknown> => prop !== null && typeof prop === 'object')
        .map((prop) => ({
          name: String(prop['name'] ?? ''),
          type: String(prop['type'] ?? ''),
          required: prop['required'] === true,
          ...(typeof prop['default'] === 'string' ? { default: prop['default'] } : {}),
          ...(typeof prop['description'] === 'string' && prop['description'].length > 0 ? { description: prop['description'] } : {}),
        })),
    ).filter((prop) => prop.name.length > 0);
    if (props.length === 0) continue;
    out.set(id, { props, events: Array.isArray(record['events']) ? record['events'].length : 0, source: toRelative(contractsMetadataPath) });
  }
  return out;
}

async function fromBuiltRegistry(ids: readonly string[]): Promise<Map<string, { props: PropRow[]; events: number; source: string }>> {
  const out = new Map<string, { props: PropRow[]; events: number; source: string }>();
  for (const id of ids) {
    const path = join(builtRegistryDir, 'r', `${id}.json`);
    if (!existsSync(path)) continue;
    const item = JSON.parse(await readFile(path, 'utf8')) as { meta?: { props?: PropRow[]; events?: unknown[] } };
    const props = Array.isArray(item.meta?.props) ? item.meta.props : [];
    if (props.length === 0) continue;
    out.set(id, { props, events: Array.isArray(item.meta?.events) ? item.meta.events.length : 0, source: toRelative(path) });
  }
  return out;
}

async function fromEngine(ids: readonly string[]): Promise<Map<string, { props: PropRow[]; events: number; source: string }>> {
  const out = new Map<string, { props: PropRow[]; events: number; source: string }>();
  const sourceFiles = ids.map((id) => join(uiSourceRoot, `${id}.tsx`)).filter((path) => existsSync(path));
  if (sourceFiles.length === 0) return out;
  const tsconfig = join(uiSourceRoot, '..', 'tsconfig.json');
  const entries = await extractComponentMetadata({ sourceFiles, ...(existsSync(tsconfig) ? { tsconfig } : {}) });
  for (const id of ids) {
    const best = entries
      .filter((entry) => entry.id === id)
      .sort((a, b) => b.props.length - a.props.length || a.name.localeCompare(b.name))[0];
    if (best === undefined) continue;
    const props = authoredOnly(
      best.props.map((prop) => ({
        name: prop.name,
        type: prop.type,
        required: prop.required,
        ...(prop.default !== undefined ? { default: prop.default } : {}),
        ...(prop.description !== undefined ? { description: prop.description } : {}),
      })),
    );
    if (props.length === 0) continue;
    out.set(id, { props, events: best.events.length, source: toRelative(best.sourceFile) });
  }
  return out;
}

/** The DTCG path a public CSS variable was measured under, when the audit covers it. */
function dtcgColorPath(cssName: string): string | undefined {
  const name = cssName.replace(/^-+/, '');
  if (!name.startsWith('color-')) return undefined;
  const tier = tierOf(name);
  const tail = name.slice('color-'.length);
  if (tier === 'semantic') return `color.semantic.${tail}`;
  if (tier === 'component') {
    for (const layer of ['foreground', 'background'] as const) {
      if (tail.endsWith(`-${layer}`)) return `color.component.${tail.slice(0, -(layer.length + 1))}.${layer}`;
    }
  }
  return undefined;
}

function cssVariablesOf(css: string): string[] {
  return [...new Set([...css.matchAll(/var\(\s*--([A-Za-z0-9-]+)/g)].map((match) => `--${match[1] ?? ''}`))].sort();
}

async function axeEntries(): Promise<Map<string, { violations: number; incomplete: number }> | undefined> {
  for (const path of AXE_REPORT_CANDIDATES) {
    if (!existsSync(path)) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(path, 'utf8'));
    } catch {
      return undefined;
    }
    const roots: unknown[] = isRecord(parsed) ? [parsed['components'], parsed['results'], parsed] : [];
    const out = new Map<string, { violations: number; incomplete: number }>();
    for (const root of roots) {
      for (const [id, row] of toEntries(root)) {
        const violations = typeof row['violations'] === 'number' ? row['violations'] : Array.isArray(row['violations']) ? row['violations'].length : 0;
        const incomplete = typeof row['incomplete'] === 'number' ? row['incomplete'] : Array.isArray(row['incomplete']) ? row['incomplete'].length : 0;
        out.set(id, { violations, incomplete });
      }
    }
    if (out.size > 0) return out;
  }
  return undefined;
}

async function a11yFor(id: string, cssVariables: readonly string[]): Promise<ComponentA11y> {
  const paths = new Set(cssVariables.map((variable) => dtcgColorPath(variable)).filter((path): path is string => path !== undefined));
  const pairs = contrastPairs().filter((record) => record.pair.split(/\son\s/i).some((side) => paths.has(side.trim())));
  const contrast = { audited: pairs.length, failures: pairs.filter((record) => !record.pass).length, pairs: pairs.map((record) => record.id).sort() };

  const report = await axeEntries();
  const entry = report?.get(id);
  const axe =
    entry === undefined
      ? { status: 'not-run' as const, evidence: report === undefined ? `no axe-core report at ${AXE_REPORT_CANDIDATES.map(toRelative).join(' or ')}` : `no entry for "${id}" in the axe-core report`, violations: 0, incomplete: 0 }
      : {
          status: entry.violations === 0 && entry.incomplete === 0 ? ('passed' as const) : ('failed' as const),
          evidence: 'axe-core Tier-3 report',
          violations: entry.violations,
          incomplete: entry.incomplete,
        };

  const reasons: string[] = [];
  if (axe.status === 'failed') reasons.push(`${String(axe.violations)} axe violation(s), ${String(axe.incomplete)} incomplete`);
  if (contrast.failures > 0) reasons.push(`${String(contrast.failures)} WCAG 2.2 AA contrast failure(s) in the compiled artifact`);
  if (axe.status === 'not-run') reasons.push('the axe-core run has not published a report for this component');

  const status = axe.status === 'failed' || contrast.failures > 0 ? 'blocked' : axe.status === 'passed' && contrast.audited > 0 ? 'verified' : 'provisional';
  return { gate: 3, standard: 'WCAG 2.2 AA', engine: 'axe-core', axe, contrast, status, reasons };
}

/** Read the registry index when it has been built, so `list_components` matches what ships. */
async function registryState(): Promise<{ built: boolean; index: string | null; items: readonly string[] }> {
  const index = join(builtRegistryDir, 'registry.json');
  if (!existsSync(index)) return { built: false, index: null, items: [] };
  const parsed = JSON.parse(await readFile(index, 'utf8')) as { items?: { name: string }[] };
  return { built: true, index: toRelative(index), items: (parsed.items ?? []).map((item) => item.name) };
}

/**
 * Build the catalogue. Resolution order for props: the frozen contracts artifact, then
 * the built registry item (so MCP and `shadcn add` can never disagree), then a live
 * engine extraction.
 */
export async function buildCatalog(): Promise<Catalog> {
  const ids = await discoverComponents();
  const registry = await registryState();

  const contracts = await fromContractsArtifact(ids);
  const built = await fromBuiltRegistry(ids);
  const missing = ids.filter((id) => !contracts.has(id) && !built.has(id));
  const extracted = missing.length > 0 ? await fromEngine(missing) : new Map<string, { props: PropRow[]; events: number; source: string }>();

  const components: CatalogComponent[] = [];
  for (const id of ids) {
    const sourcePath = join(uiSourceRoot, `${id}.tsx`);
    const stylesheetPath = join(uiSourceRoot, 'styles', `${id}.css`);
    const storiesPath = join(uiSourceRoot, `${id}.stories.tsx`);
    const sourceText = await readFile(sourcePath, 'utf8');
    const stylesheetText = existsSync(stylesheetPath) ? await readFile(stylesheetPath, 'utf8') : '';
    const cssVariables = cssVariablesOf(stylesheetText);

    const fromContract = contracts.get(id);
    const fromBuilt = built.get(id);
    const fromEngine = extracted.get(id);
    const resolved = fromContract ?? fromBuilt ?? fromEngine;
    const provenance = resolved === fromContract ? 'contracts-metadata' : resolved === fromBuilt ? 'built-registry' : resolved === fromEngine ? 'engine-extraction' : 'unresolved';

    const a11y = await a11yFor(id, cssVariables);
    const blockers: string[] = [];
    if (resolved === undefined) blockers.push('no prop contract could be resolved');
    if (stylesheetText.length === 0) blockers.push('no component stylesheet');
    if (!existsSync(storiesPath)) blockers.push('no CSF stories');
    if (a11y.status === 'blocked') blockers.push(...a11y.reasons);

    components.push({
      id,
      name: displayName(id),
      registryName: id,
      registryType: 'registry:component',
      status: a11y.status === 'blocked' || resolved === undefined ? 'blocked' : blockers.length === 0 && a11y.status === 'verified' ? 'reviewed' : 'provisional',
      propCount: resolved?.props.length ?? 0,
      requiredPropCount: resolved === undefined ? 0 : resolved.props.filter((prop) => prop.required).length,
      eventCount: resolved?.events ?? 0,
      props: resolved?.props ?? [],
      metadata: { provenance, source: resolved?.source ?? 'none' },
      files: {
        source: toRelative(sourcePath),
        stylesheet: existsSync(stylesheetPath) ? toRelative(stylesheetPath) : null,
        stories: existsSync(storiesPath) ? toRelative(storiesPath) : null,
        sha256: sha256(sourceText),
      },
      tokens: { referenced: cssVariables.length, cssVariables },
      a11y,
      distributedInRegistry: registry.items.includes(id),
    });
  }

  const intent = await readFile(designMarkdownPath, 'utf8');
  return { components, intent: { file: toRelative(designMarkdownPath), sha256: sha256(intent) }, registry };
}
