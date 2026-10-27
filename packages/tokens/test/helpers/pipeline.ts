/**
 * Pipeline harness shared by the token tests.
 *
 * The suite never trusts a stale artifact: it compiles the real one-way pipeline into
 * a throwaway directory (`ensureFreshBuild`) and additionally materialises the
 * package's own outputs when they are missing (`ensurePackageBuilt`), so both the
 * freshly generated tree and the checked-in tree can be asserted.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `packages/tokens`. */
export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Repository root. */
export const repoRoot = resolve(packageRoot, '..', '..');
/** The Intent SSOT. */
export const designMdPath = join(repoRoot, 'DESIGN.md');
const buildScript = join(packageRoot, 'scripts', 'build.mjs');

/** Marker written last so an interrupted build is never mistaken for a complete one. */
const COMPLETION_MARKER = '.dh-build-complete';

export interface BuildResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Run `scripts/build.mjs` and capture instead of throwing, for gate drills. */
export function runBuild(args: readonly string[] = [], cwd = packageRoot): BuildResult {
  try {
    const stdout = execFileSync(process.execPath, [buildScript, ...args], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const failure = error as { status?: number | null; stdout?: string; stderr?: string };
    return {
      status: failure.status ?? 1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
    };
  }
}

/** Stable location for the fresh generation, reused across the suite's workers. */
export function freshBuildRoot(): string {
  return process.env.DH_TOKENS_FRESH_ROOT ?? join(tmpdir(), 'designharness-tokens-fresh-build');
}

/** A private, empty package root for build-gate drills. */
export function scratchRoot(name: string): string {
  const root = join(tmpdir(), `designharness-tokens-${name}`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  return root;
}

/**
 * Compile the whole pipeline into `freshBuildRoot()` once per working tree.
 *
 * `--no-compile` keeps `tsc` out of the throwaway run: the runtime module is compiled
 * from the real package, which the `runtime-api` suite exercises.
 */
export function ensureFreshBuild(root = freshBuildRoot()): string {
  if (existsSync(join(root, COMPLETION_MARKER))) return root;
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  const result = runBuild(['--root', root, '--no-compile', '--write', '--quiet']);
  if (result.status !== 0) {
    throw new Error(`token pipeline failed while building ${root}\n${result.stdout}\n${result.stderr}`);
  }
  writeFileSync(join(root, COMPLETION_MARKER), 'ok', 'utf8');
  return root;
}

/** Files that make the package's own outputs usable by tests and consumers. */
const REQUIRED_PACKAGE_FILES = [
  'tokens.json',
  'dist/css/index.css',
  'dist/recipe/index.js',
  'tailwind/theme.css',
  'src/generated/token-data.ts',
  'dist/index.js',
];

/**
 * Build the real package only when its generated tree is missing (a fresh clone or a
 * turbo cache restore that skipped `src/generated`). A drift failure there is not a
 * test failure — the committed artifact is machine-generated, so the repair is to
 * regenerate it from DESIGN.md, which stays the SSOT.
 */
export function ensurePackageBuilt(): void {
  const missing = REQUIRED_PACKAGE_FILES.some((relative) => !existsSync(join(packageRoot, relative)));
  if (!missing) return;
  const first = runBuild([]);
  if (first.status === 0) return;
  if (!/do not match a fresh regeneration/.test(first.stderr)) {
    throw new Error(`token build failed while materialising the package tree\n${first.stdout}\n${first.stderr}`);
  }
  const second = runBuild(['--write']);
  if (second.status !== 0) {
    throw new Error(`token build failed even after regeneration\n${second.stdout}\n${second.stderr}`);
  }
  console.warn('[tokens:test] the generated token tree was missing or stale and was regenerated from DESIGN.md');
}

/** Read a generated file from a build root. */
export function readGenerated(root: string, relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

/** Parse the DTCG artifact out of a build root. */
export function readArtifact(root: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, 'tokens.json'), 'utf8')) as Record<string, unknown>;
}

/** Every output file the pipeline is contracted to produce. */
export const GENERATED_TARGETS: readonly string[] = [
  'tokens.json',
  'dist/css/index.css',
  'dist/css/light.css',
  'dist/css/dark.css',
  'dist/css/high-contrast.css',
  'dist/css/high-contrast-dark.css',
  'dist/json/tokens.json',
  'dist/recipe/index.js',
  'dist/recipe/index.d.ts',
  'dist/scss/_tokens.scss',
  'dist/compose/Color.kt',
  'dist/swift/ColorAsset.swift',
  'tailwind/theme.css',
];
