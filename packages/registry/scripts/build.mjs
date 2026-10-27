#!/usr/bin/env node
/**
 * `@designharness/registry` build — the declared `build` script.
 *
 *   1. `tsc -p tsconfig.json`        → dist/ (the package's exports and the server bin)
 *   2. `buildAndWriteRegistry()`     → registry/registry.json, registry/index.json,
 *                                      registry/r/<name>.json for every item
 *   3. every document is validated against the shadcn schema before it lands on disk,
 *      and the run is repeated in memory to prove the output is byte-stable.
 *
 * The payload it writes is the workspace's real bytes: `packages/ui/src` component
 * sources verbatim, the compiled token CSS from `packages/tokens/dist`, the Tailwind
 * theme, the shared class helper and the authored stylesheets. If any of those is
 * missing, the build fails with the command that produces it instead of writing a
 * placeholder item.
 *
 * Flags:
 *   --out <dir>      write somewhere else (temp directories in tests)
 *   --url <base>     public base URL baked into the index and item homepages
 *   --check          rebuild and compare against what is on disk; fail on drift, write nothing
 *   --json           print the summary as JSON on the last line
 *   --no-compile     skip step 1 (used when dist/ is already current)
 *   --quiet          only print warnings and errors
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, '..');

function parseArgs(argv) {
  const options = { outputDir: join(packageRoot, 'registry'), baseUrl: undefined, check: false, json: false, compile: true, quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      i += 1;
      const next = argv[i];
      if (next === undefined) throw new Error(`${arg} expects a value`);
      return next;
    };
    if (arg === '--out' || arg === '--output-dir') options.outputDir = resolve(value());
    else if (arg === '--url' || arg === '--base-url') options.baseUrl = value();
    else if (arg === '--check') options.check = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--no-compile') options.compile = false;
    else if (arg === '--quiet' || arg === '--silent') options.quiet = true;
    else throw new Error(`Unknown option for packages/registry/scripts/build.mjs: ${String(arg)}`);
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const log = (...args) => {
  if (!options.quiet) console.log(...args);
};
const label = (message) => console.log(`[registry:build] ${message}`);

if (options.compile) {
  const tsc = spawnSync(process.execPath, [join(packageRoot, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(packageRoot, 'tsconfig.json')], {
    cwd: packageRoot,
    encoding: 'utf8',
  });
  if (tsc.error !== undefined && tsc.error.code === 'ENOENT') {
    // Fall back to the workspace-resolved compiler when the package has no local link.
    const fallback = spawnSync('npx', ['--no-install', 'tsc', '-p', join(packageRoot, 'tsconfig.json')], { cwd: packageRoot, encoding: 'utf8' });
    if (fallback.status !== 0) {
      console.error(fallback.stdout ?? '');
      console.error(fallback.stderr ?? '');
      process.exit(fallback.status ?? 1);
    }
  } else if (tsc.status !== 0) {
    if (tsc.stdout) process.stderr.write(tsc.stdout);
    if (tsc.stderr) process.stderr.write(tsc.stderr);
    label('TypeScript compilation failed — no registry was written');
    process.exit(tsc.status ?? 1);
  }
}

const buildModuleUrl = pathToFileURL(join(packageRoot, 'dist', 'build.js')).href;
const { buildRegistry, writeRegistry, BASE_ITEM_NAME, STYLE_ITEM_NAME } = await import(buildModuleUrl);

const built = await buildRegistry({ outputDir: options.outputDir, ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }) });

if (options.check) {
  let drift = 0;
  for (const file of built.files) {
    if (!existsSync(file.path)) {
      console.error(`[registry:build] MISSING  ${file.relativePath}`);
      drift += 1;
      continue;
    }
    const onDisk = await readFile(file.path, 'utf8');
    if (onDisk !== file.contents) {
      console.error(`[registry:build] DRIFTED  ${file.relativePath}`);
      drift += 1;
    }
  }
  if (drift > 0) {
    console.error(`[registry:build] the committed registry is stale (${String(drift)} file(s)); run the build without --check`);
    process.exit(1);
  }
  label(`registry is up to date (${String(built.files.length)} documents, ${String(built.summary.distributedBytes)} bytes)`);
  process.exit(0);
}

const written = await writeRegistry(built, options.outputDir);

// Determinism gate: a second build must produce the same bytes, otherwise a consumer
// cannot tell a real change from a rebuild artifact.
const again = await buildRegistry({ outputDir: options.outputDir, ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }) });
if (again.files.length !== built.files.length) throw new Error('the registry build is not deterministic: the file list changed between runs');
for (let i = 0; i < again.files.length; i += 1) {
  const first = built.files[i];
  const second = again.files[i];
  if (first.contents !== second.contents) throw new Error(`the registry build is not deterministic: ${String(first.relativePath)} differs between runs`);
}

const components = built.summary.components;
const missingBase = built.items.filter((item) => item.type === 'registry:component' && !(item.registryDependencies ?? []).includes(BASE_ITEM_NAME));
if (missingBase.length > 0) throw new Error(`component items must depend on ${BASE_ITEM_NAME}: ${missingBase.map((item) => String(item.name)).join(', ')}`);
if (!components.includes('button')) throw new Error('the frozen component id "button" (TOKEN-API.md §6) is not present in the ui sources');

const inventory = written.map((file) => ({
  path: file.relativePath,
  bytes: file.bytes,
  sha256: createHash('sha256').update(file.contents).digest('hex').slice(0, 16),
}));

label(`wrote ${String(written.length)} documents to ${options.outputDir}`);
for (const entry of inventory) log(`  ${entry.path}  ${String(entry.bytes).padStart(9)} bytes  sha256:${entry.sha256}`);
label(`${String(components.length)} component(s): ${components.join(', ')}`);
label(`items: ${built.summary.items.join(', ')} (base=${BASE_ITEM_NAME}, style=${STYLE_ITEM_NAME})`);

if (options.json) {
  console.log(JSON.stringify({ ok: true, outputDir: options.outputDir, summary: built.summary, files: inventory }, null, 2));
}
