/**
 * Component prop contracts for the registry.
 *
 * TOKEN-API.md §6 freezes the file the harness reads:
 * `packages/contracts/generated/component-metadata.json`, produced by
 * `node packages/contracts/scripts/codegen.mjs` from the real `packages/ui/src` sources.
 * That file only exists once the contracts agent has re-run codegen against a populated
 * `ui` package, so the registry degrades in a fixed order instead of inventing a prop
 * list: the artifact, then a live run of the *same* extractor the codegen uses
 * (`extractComponentMetadata` from `@designharness/engine`), then the component's CSF
 * `argTypes`, which the ui layer writes as its machine-readable state contract. Which of
 * the three produced the numbers is always recorded in `provenance`, so a consumer can
 * tell an authoritative artifact from a live extraction.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extractComponentMetadata } from '@designharness/engine';
import type { ComponentMetadataEntry } from '@designharness/engine';
import { readStoryPropsForId } from './story-props.js';
import { toPublicName } from './sources.js';
import { contractsMetadataPath, uiSourceRoot, workspaceRoot, toRelative } from './paths.js';

/** One prop as the harness publishes it. */
export interface PropDescriptor {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly default?: string;
  readonly description?: string;
  readonly deprecation?: string;
}

/** One callback prop, kept separate because the contracts list them separately. */
export interface EventDescriptor {
  readonly name: string;
  readonly signature: string;
  readonly description?: string;
}

/** The prop contract of one component, plus where it came from. */
export interface ComponentContract {
  readonly id: string;
  /** The exported component name the prop list was taken from. */
  readonly displayName: string;
  readonly sourceFile: string;
  /** The authored surface: what a consumer is meant to set (see {@link authoredOnly}). */
  readonly props: readonly PropDescriptor[];
  readonly events: readonly EventDescriptor[];
  /** Size of the unfiltered contract the source produced. */
  readonly totalProps: number;
  readonly provenance: 'contracts-metadata' | 'engine-extraction' | 'story-argTypes';
  /** The file the contract was read from (artifact path, story, or the extracted source). */
  readonly source: string;
}

/**
 * A contract read from a typed source is the *whole* accepted surface: for a component
 * built on a Zag primitive that includes every inherited DOM attribute, which is noise
 * for a consumer choosing props. A prop is treated as authored when it is required,
 * carries a JSDoc description, or has a source-derived default — the three things the
 * ui layer only writes for its own API.
 */
export function authoredOnly(props: readonly PropDescriptor[]): PropDescriptor[] {
  return props.filter((prop) => prop.required || prop.description !== undefined || prop.default !== undefined);
}

const asString = (value: unknown): string | undefined => (typeof value === 'string' && value.length > 0 ? value : undefined);

function descriptorFrom(prop: Record<string, unknown>): PropDescriptor | undefined {
  const name = asString(prop['name']);
  const type = asString(prop['type']);
  if (name === undefined || type === undefined) return undefined;
  const description = asString(prop['description']);
  const defaultValue = prop['default'];
  const deprecation = asString(prop['deprecation']);
  return {
    name,
    type,
    required: prop['required'] === true,
    ...(typeof defaultValue === 'string' && defaultValue.length > 0 ? { default: defaultValue } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(deprecation !== undefined ? { deprecation } : {}),
  };
}

/** Collect every `props[]` object the artifact holds for one component id. */
function propsOf(entry: unknown): PropDescriptor[] {
  if (!Array.isArray(entry)) return [];
  const out: PropDescriptor[] = [];
  for (const raw of entry) {
    if (raw !== null && typeof raw === 'object') {
      const descriptor = descriptorFrom(raw as Record<string, unknown>);
      if (descriptor !== undefined) out.push(descriptor);
    }
  }
  return out;
}

function eventsOf(entry: unknown): EventDescriptor[] {
  if (!Array.isArray(entry)) return [];
  const out: EventDescriptor[] = [];
  for (const raw of entry) {
    if (raw === null || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    const name = asString(record['name']);
    const signature = asString(record['signature']) ?? asString(record['type']);
    if (name === undefined || signature === undefined) continue;
    const description = asString(record['description']);
    out.push({ name, signature, ...(description !== undefined ? { description } : {}) });
  }
  return out;
}

/**
 * Read `component-metadata.json`. The codegen writes the object-keyed shape
 * (`{ "<id>": { props, source } }`); an array of entries is also accepted so the
 * registry keeps working if the contracts agent publishes the raw extractor output.
 */
export async function readContractsMetadata(path: string = contractsMetadataPath): Promise<Map<string, ComponentContract> | undefined> {
  if (!existsSync(path)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`${toRelative(path)} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }

  const contracts = new Map<string, ComponentContract>();
  const absorb = (id: string, record: Record<string, unknown>, fallbackName: string): void => {
    const all = propsOf(record['props']);
    const events = eventsOf(record['events']);
    const authored = authoredOnly(all);
    if (authored.length === 0 && events.length === 0) return;
    contracts.set(id, {
      id,
      displayName: asString(record['displayName']) ?? asString(record['component']) ?? fallbackName,
      sourceFile: asString(record['sourceFile']) ?? asString(record['source']) ?? '',
      props: authored,
      events,
      totalProps: all.length,
      provenance: 'contracts-metadata',
      source: toRelative(path),
    });
  };

  if (Array.isArray(parsed)) {
    for (const raw of parsed) {
      if (raw === null || typeof raw !== 'object') continue;
      const record = raw as Record<string, unknown>;
      const id = asString(record['componentId']) ?? asString(record['id']);
      const name = asString(record['name']) ?? asString(record['displayName']) ?? id;
      if (id === undefined || name === undefined) continue;
      absorb(id, record, name);
    }
  } else if (parsed !== null && typeof parsed === 'object') {
    for (const [id, raw] of Object.entries(parsed as Record<string, unknown>)) {
      if (raw === null || typeof raw !== 'object') continue;
      absorb(id, raw as Record<string, unknown>, id);
    }
  }

  return contracts.size > 0 ? contracts : undefined;
}

/** The ui + primitives sources for the given component ids, newest-layer first. */
function candidateSources(ids: readonly string[]): string[] {
  const files: string[] = [];
  for (const id of ids) {
    files.push(join(uiSourceRoot, `${id}.tsx`));
  }
  // A styled layer that only re-exports a primitive leaves the prop interface in the
  // primitive; the extractor can read it there, so both layers are candidates.
  const primitivesRoot = join(workspaceRoot, 'packages', 'primitives', 'src');
  for (const id of ids) {
    files.push(join(primitivesRoot, `${id}.tsx`));
  }
  return files.filter((file) => existsSync(file));
}

/** Pick the entry that best describes a component: the widest prop contract wins. */
function bestEntry(entries: readonly ComponentMetadataEntry[], id: string): ComponentMetadataEntry | undefined {
  return entries
    .filter((entry) => entry.id === id)
    .sort((a, b) => b.props.length - a.props.length || a.name.localeCompare(b.name))[0];
}

async function extractContracts(ids: readonly string[]): Promise<Map<string, ComponentContract>> {
  const contracts = new Map<string, ComponentContract>();
  const sources = candidateSources(ids);
  if (sources.length === 0) return contracts;

  const tsconfig = join(uiSourceRoot, '..', 'tsconfig.json');
  const entries = await extractComponentMetadata({
    sourceFiles: sources,
    ...(existsSync(tsconfig) ? { tsconfig } : {}),
  });

  for (const id of ids) {
    const entry = bestEntry(entries, id);
    if (entry === undefined) continue;
    const props = entry.props.map((prop) => ({
      name: prop.name,
      type: prop.type,
      required: prop.required,
      ...(prop.default !== undefined ? { default: prop.default } : {}),
      ...(prop.description !== undefined ? { description: prop.description } : {}),
      ...(prop.deprecation !== undefined ? { deprecation: prop.deprecation } : {}),
    }));
    const authored = authoredOnly(props);
    const events = entry.events.map((event) => ({
      name: event.name,
      signature: event.signature,
      ...(event.description !== undefined ? { description: event.description } : {}),
    }));
    if (authored.length === 0 && events.length === 0) continue;
    contracts.set(id, {
      id,
      displayName: entry.name,
      sourceFile: toRelative(entry.sourceFile),
      props: authored,
      events,
      totalProps: props.length,
      provenance: 'engine-extraction',
      source: toRelative(entry.sourceFile),
    });
  }
  return contracts;
}

/**
 * Resolve the prop contracts for `ids`, preferring the frozen contracts artifact, then a
 * live engine extraction, then the component's CSF `argTypes`. Ids with no resolvable
 * contract are simply absent from the map — the caller decides whether that is a build
 * error, because a missing prop list must never be papered over with an invented one.
 */
export async function loadComponentContracts(ids: readonly string[]): Promise<Map<string, ComponentContract>> {
  const resolved = new Map<string, ComponentContract>();

  const fromArtifact = await readContractsMetadata();
  if (fromArtifact !== undefined) {
    for (const id of ids) {
      const contract = fromArtifact.get(id);
      if (contract !== undefined) resolved.set(id, contract);
    }
  }

  // The artifact is authoritative but may lag a component the contracts agent has not
  // re-extracted yet; those ids are topped up from the sources, never replaced.
  const unresolved = ids.filter((id) => !resolved.has(id));
  if (unresolved.length > 0) {
    const extracted = await extractContracts(unresolved);
    for (const [id, contract] of extracted) resolved.set(id, contract);
  }

  for (const id of ids) {
    if (resolved.has(id)) continue;
    const story = await readStoryPropsForId(id);
    if (story === undefined || story.props.length === 0) continue;
    resolved.set(id, {
      id,
      displayName: toPublicName(id),
      sourceFile: toRelative(join(uiSourceRoot, `${id}.tsx`)),
      props: story.props,
      events: [],
      totalProps: story.props.length,
      provenance: 'story-argTypes',
      source: toRelative(story.storyPath),
    });
  }

  return resolved;
}
