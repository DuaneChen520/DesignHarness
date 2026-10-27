/**
 * Bridge to the official `@google/design.md` DTCG exporter.
 *
 * The harness never hand-authors the primitive colour tier: it shells out to the
 * real CLI (`design.md export --format dtcg`) and treats its primitive `color`
 * output as the authoritative base tier, then synthesises the semantic/component
 * tiers on top of it (see `dtcg/build.ts`).
 *
 * The CLI path is resolved robustly from this module's own URL via
 * `import.meta.resolve`, which follows the pnpm symlink/store layout regardless of
 * the current working directory. `require.resolve` is deliberately not used: the
 * package's `exports` map only exposes an `import` condition, so a `require`
 * resolution would fail.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** The design.md CLI resolves to its ESM entry; that file is the runnable bin. */
function resolveDesignMdCli(): string {
  const specifier = '@google/design.md';
  const url = import.meta.resolve(specifier);
  if (!url.startsWith('file:')) {
    throw new Error(`Unexpected non-file resolution for ${specifier}: ${url}`);
  }
  return fileURLToPath(url);
}

/**
 * A single DTCG token node as emitted by the exporter. Deliberately loose —
 * the exporter's exact shape (object colour values, `{value,unit}` dimensions) is
 * owned by the upstream package, so we read defensively.
 */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

/** Run `design.md export --format dtcg <file>` and return the parsed artifact. */
export function exportDtcgBase(designMdPath: string): JsonObject {
  const cli = resolveDesignMdCli();
  const stdout = execFileSync(process.execPath, [cli, 'export', '--format', 'dtcg', designMdPath], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const parsed: unknown = JSON.parse(stdout);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('design.md export returned a non-object payload');
  }
  return parsed as JsonObject;
}

/** Expose the resolved CLI path (handy for diagnostics / tests). */
export const DESIGN_MD_CLI_PATH: string = resolveDesignMdCli();
