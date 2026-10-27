/**
 * Refresh the generated layer.
 *
 * Validation and `@msw/source` generation are the deliverable, so the build
 * runs them before it type-checks and emits a single error report when either
 * fails.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageRoot, '..', '..');
const toPosix = (path) => path.split('\\').join('/');
const repositoryPath = (absolute) => toPosix(absolute.slice(repoRoot.length + 1));

/** Locate the package's own TypeScript compiler. */
function resolveTypeScriptCli() {
  const typescriptRoot = dirname(require.resolve('typescript'));
  for (const candidate of [join(typescriptRoot, 'bin', 'tsc'), join(typescriptRoot, '..', 'bin', 'tsc')]) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error('typescript is installed but no bin/tsc could be found in it');
}

function run(label, command, args) {
  const result = spawnSync(command, args, { cwd: packageRoot, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`[contracts:build] ${label} failed with exit code ${String(result.status ?? 'null')}`);
    process.exit(result.status ?? 1);
  }
}

run('codegen', process.execPath, [join(packageRoot, 'scripts', 'codegen.mjs')]);
run('tsc', process.execPath, [resolveTypeScriptCli(), '-p', 'tsconfig.build.json']);

const distDirectory = join(packageRoot, 'dist');
const openapiSource = join(packageRoot, 'openapi');
const openapiTarget = join(distDirectory, 'openapi');
mkdirSync(openapiTarget, { recursive: true });
const copied = readdirSync(openapiSource).filter((name) => name.endsWith('.json'));
for (const name of copied) {
  copyFileSync(join(openapiSource, name), join(openapiTarget, name));
}

const generatedSource = join(packageRoot, 'generated');
if (existsSync(generatedSource)) {
  const generatedTarget = join(distDirectory, 'generated');
  mkdirSync(generatedTarget, { recursive: true });
  for (const name of readdirSync(generatedSource)) {
    copyFileSync(join(generatedSource, name), join(generatedTarget, name));
  }
}

console.log(
  `[contracts:build] dist is ready: ${copied.map((name) => repositoryPath(join(openapiTarget, name))).join(', ')} copied alongside the compiled modules`,
);
