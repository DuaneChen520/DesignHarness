/**
 * High-level DTCG generation entry point used by the `@designharness/tokens` build.
 * Lints (optionally), runs the official exporter, and synthesises the full artifact.
 */
import { readFile } from 'node:fs/promises';
import { parseDesignDocument } from '../designmd/parse.js';
import type { DesignDocument } from '../designmd/types.js';
import { exportDtcgBase, type JsonObject } from './cli.js';
import { buildArtifact, serializeArtifact } from './build.js';
import type { DtcgArtifact } from './types.js';

export interface GenerateResult {
  readonly artifact: DtcgArtifact;
  readonly json: string;
  readonly base: JsonObject;
  readonly document: DesignDocument;
}

/** Generate the artifact from a DESIGN.md path (reads + parses + exports + builds). */
export async function generateArtifact(designMdPath: string): Promise<GenerateResult> {
  const md = await readFile(designMdPath, 'utf8');
  const document = parseDesignDocument(md);
  const base = exportDtcgBase(designMdPath);
  const artifact = buildArtifact(base, document);
  return { artifact, json: serializeArtifact(artifact), base, document };
}

/**
 * Synchronous variant used by the CLI/gates where the file is already read. Does not
 * re-run the official exporter — supply the base export yourself.
 */
export function artifactFromParts(base: JsonObject, document: DesignDocument): { artifact: DtcgArtifact; json: string } {
  const artifact = buildArtifact(base, document);
  return { artifact, json: serializeArtifact(artifact) };
}

export * from './types.js';
export * from './cli.js';
export * from './build.js';
export * from './css-name.js';
export * from './resolve.js';
