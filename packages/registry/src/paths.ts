/**
 * Workspace path resolution for the registry build and server.
 *
 * Every path is derived from this module's own location, never from the current
 * working directory: `pnpm --filter`, `turbo`, a spawned CLI and a test runner all
 * start in different places, and a registry that silently read a different
 * `packages/ui/src` than the one it shipped would be worse than no registry at all.
 *
 * Two environment variables override the defaults so the CLI can target a different
 * workspace or serve a registry built elsewhere:
 *   `DESIGNHARNESS_WORKSPACE_ROOT` — repository root
 *   `DESIGNHARNESS_REGISTRY_URL`   — public URL the registry is served from
 */
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

/** Walk up from `start` looking for `pnpm-workspace.yaml`; the first hit is the root. */
function findWorkspaceRoot(start: string): string {
  let current = resolve(start);
  for (;;) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(
        `unable to locate the workspace root from ${start}: no parent directory contains pnpm-workspace.yaml`,
      );
    }
    current = parent;
  }
}

/** `packages/registry/{src,dist}` -> `packages` -> repository root. */
export const workspaceRoot: string = process.env['DESIGNHARNESS_WORKSPACE_ROOT'] ?? findWorkspaceRoot(resolve(moduleDirectory, '..', '..'));

/** This package's directory (`packages/registry`). */
export const registryPackageRoot: string = join(workspaceRoot, 'packages', 'registry');

/** The Intent SSOT (RESEARCH.md §3.1) the registry documents. */
export const designMarkdownPath: string = join(workspaceRoot, 'DESIGN.md');

/** Component sources: the real text the registry distributes (TOKEN-API.md §4). */
export const uiSourceRoot: string = join(workspaceRoot, 'packages', 'ui', 'src');

/** Compiled token artifact, distributed through `meridian-base` (TOKEN-API.md §3/§4). */
export const tokensPackageRoot: string = join(workspaceRoot, 'packages', 'tokens');

/** Prop metadata produced by `packages/contracts/scripts/codegen.mjs` (TOKEN-API.md §6). */
export const contractsMetadataPath: string = join(workspaceRoot, 'packages', 'contracts', 'generated', 'component-metadata.json');

/** Static registry output; the directory shadcn serves. */
export const registryOutputDir: string = join(registryPackageRoot, 'registry');

/** The directory inside the output that holds one JSON document per item. */
export const registryItemsDirName = 'r';

/** Public base URL advertised by the index; `npx shadcn add <url>` is built from it. */
export const registryBaseUrl: string = (process.env['DESIGNHARNESS_REGISTRY_URL'] ?? 'http://localhost:4870').replace(/\/+$/, '');

/** Resolve a repository-relative path (`packages/ui/src/x.tsx`) against the root. */
export function fromWorkspace(relativePath: string): string {
  return isAbsolute(relativePath) ? relativePath : join(workspaceRoot, relativePath);
}

/** Repository-relative, POSIX-separated display path for an absolute path. */
export function toRelative(absolutePath: string): string {
  const root = workspaceRoot.replace(/\\/g, '/');
  const posix = absolutePath.replace(/\\/g, '/');
  return posix.startsWith(`${root}/`) ? posix.slice(root.length + 1) : posix;
}
