/**
 * Command implementations for the CLI.
 *
 * Each action delegates to the package that owns the behaviour — the tokens build script, the
 * official DESIGN.md gate, the engine library, the registry server, the MCP server. The CLI is
 * a front door, never a second implementation, so `designharness tokens lint` and the CI tier
 * can never disagree.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditContrast, extractComponentMetadata } from '@designharness/engine';
import { createServer, toolNamesOf, TOOL_NAMES } from '@designharness/mcp';
import { startRegistryServer } from '@designharness/registry';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const IS_WINDOWS = process.platform === 'win32';

export interface BuildOptions {
  readonly design: string;
  readonly dryRun: boolean;
}
export interface LintOptions {
  readonly design: string;
  readonly json: boolean;
}
export interface AuditOptions {
  readonly json: boolean;
}
export interface MetadataOptions {
  readonly dir: string;
  readonly tsconfig?: string;
  readonly out?: string;
}
export interface RegistryBuildOptions {
  readonly out: string;
}
export interface ServeOptions {
  readonly port: string;
  readonly host: string;
}
export interface McpOptions {
  readonly check: boolean;
}
export interface GateOptions {
  readonly tier: string;
}
export interface DoctorOptions {
  readonly json: boolean;
}
export interface GuiOptions {
  readonly port?: string;
  readonly force?: boolean;
}

/** Spawn a child and inherit stdio; returns its exit code. */
function forward(
  command: string,
  args: readonly string[],
  cwd = workspaceRoot,
  env: NodeJS.ProcessEnv = process.env,
): number {
  if (IS_WINDOWS) {
    if (command === 'pnpm') {
      const result = spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm', ...args], { cwd, stdio: 'inherit', env });
      return result.status ?? 1;
    }
    const result = spawnSync(command, [...args], { cwd, stdio: 'inherit', env });
    return result.status ?? 1;
  }
  const result = spawnSync(command, [...args], { cwd, stdio: 'inherit', env });
  return result.status ?? 1;
}

function killProcessOnPort(port: number): void {
  try {
    if (IS_WINDOWS) {
      const output = spawnSync('cmd.exe', ['/d', '/s', '/c', `netstat -ano -p tcp | findstr :${port}`], { encoding: 'utf8' }).stdout ?? '';
      const lines = output.trim().split(/\r?\n/);
      const pids = new Set<string>();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const localAddr = parts[1] ?? '';
        if (localAddr.endsWith(`:${port}`)) {
          const pid = parts[parts.length - 1];
          if (pid && /^\d+$/.test(pid) && pid !== '0' && pid !== String(process.pid)) {
            pids.add(pid);
          }
        }
      }
      for (const pid of pids) {
        console.log(`designharness: terminating process ${pid} occupying port ${port} ...`);
        spawnSync('taskkill', ['/F', '/PID', pid], { stdio: 'ignore' });
      }
    } else {
      const output = spawnSync('lsof', ['-ti', `tcp:${port}`], { encoding: 'utf8' }).stdout ?? '';
      const pids = output.trim().split(/\s+/).filter((pid) => pid && pid !== String(process.pid));
      for (const pid of pids) {
        console.log(`designharness: terminating process ${pid} occupying port ${port} ...`);
        spawnSync('kill', ['-9', pid], { stdio: 'ignore' });
      }
    }
  } catch {
    // Best-effort cleanup
  }
}

function rel(path: string): string {
  const candidate = isAbsolute(path) ? path : resolve(process.cwd(), path);
  return candidate.startsWith(workspaceRoot) ? candidate.slice(workspaceRoot.length + 1).replaceAll('\\', '/') : candidate;
}

function isAbsolute(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path);
}

export async function runTokensBuild(options: BuildOptions): Promise<void> {
  const args = ['--filter', '@designharness/tokens', 'exec', 'node', 'scripts/build.mjs'];
  if (options.design !== 'DESIGN.md') args.push('--design', rel(options.design));
  if (options.dryRun) args.push('--dry-run');
  process.exitCode = forward('pnpm', args);
}

export async function lintIntentJson(options: LintOptions): Promise<void> {
  const args = [join(workspaceRoot, 'tooling/gates/tier2-designmd.mjs'), '--design', rel(options.design)];
  if (options.json) args.push('--json');
  process.exitCode = forward(process.execPath, args);
}

export async function diffIntent(other: string, options: { design: string }): Promise<void> {
  process.exitCode = forward(process.execPath, [join(workspaceRoot, 'tooling/gates/tier2-designmd.mjs'), '--against', rel(other)]);
  void options;
}

export async function auditContrastJson(options: AuditOptions): Promise<void> {
  const artifactPath = join(workspaceRoot, 'packages/tokens/tokens.json');
  if (!existsSync(artifactPath)) {
    console.error(`designharness: no compiled artifact at ${rel(artifactPath)} — run \`designharness tokens build\` first.`);
    process.exitCode = 1;
    return;
  }
  const artifact: unknown = JSON.parse(readFileSync(artifactPath, 'utf8'));
  const report = auditContrast(artifact);
  if (options.json) {
    process.stdout.write(`${JSON.stringify({ standard: 'WCAG 2.2 AA', passed: report.passed, audited: report.results.length, failures: report.failures.map((failure) => ({ id: failure.id, ratio: failure.ratio, kind: failure.kind })), apcaWarnings: report.warnings }, null, 2)}\n`);
  } else {
    console.log(`[contrast] WCAG 2.2 AA — ${String(report.results.length)} pair(s) audited, ${String(report.failures.length)} failure(s)`);
    for (const result of report.results) {
      console.log(`  ${result.pass ? '✓' : '✗'} ${result.id.padEnd(34)} ${result.ratio.toFixed(2)}:1  APCA Lc=${String(result.lc?.toFixed(1) ?? 'n/a')}`);
    }
    console.log(`[contrast] APCA advisories (never gating): ${String(report.warnings.length)}`);
  }
  process.exitCode = report.passed ? 0 : 1;
}

export async function extractMetadata(options: MetadataOptions): Promise<void> {
  const dir = resolve(process.cwd(), options.dir);
  if (!existsSync(dir)) {
    console.error(`designharness: --dir does not exist: ${options.dir}`);
    process.exitCode = 1;
    return;
  }
  const entries = readDirSources(dir);
  if (entries.length === 0) {
    console.error(`designharness: no .ts/.tsx component sources under ${options.dir}`);
    process.exitCode = 1;
    return;
  }
  const metadata = await extractComponentMetadata({
    sourceFiles: entries,
    ...(options.tsconfig === undefined ? {} : { tsconfig: resolve(process.cwd(), options.tsconfig) }),
  });
  const serialized = `${JSON.stringify({ generatedBy: 'designharness metadata extract', count: metadata.length, components: metadata }, null, 2)}\n`;
  if (options.out === undefined) {
    process.stdout.write(serialized);
  } else {
    writeFileSync(resolve(process.cwd(), options.out), serialized, 'utf8');
    console.log(`[metadata] wrote ${String(metadata.length)} component(s) to ${rel(options.out)}`);
  }
  process.exitCode = metadata.length === 0 ? 1 : 0;
}

/** Recursively collect component sources, skipping tests/stories/declaration files. */
function readDirSources(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', 'dist', 'coverage', '.turbo'].includes(entry.name)) walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      if (/\.(test|spec|stories)\.tsx?$/.test(entry.name) || entry.name.endsWith('.d.ts')) continue;
      out.push(full);
    }
  };
  walk(dir);
  return out.sort();
}

export async function runRegistryBuild(options: RegistryBuildOptions): Promise<void> {
  const args = [join(workspaceRoot, 'packages/registry/scripts/build.mjs')];
  if (options.out !== 'packages/registry/registry') args.push('--out', rel(options.out));
  process.exitCode = forward(process.execPath, args);
}

export async function serveRegistry(options: ServeOptions): Promise<void> {
  const port = Number(options.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    console.error(`designharness: --port must be a valid TCP port, received "${options.port}"`);
    process.exitCode = 2;
    return;
  }
  const running = await startRegistryServer({ port, host: options.host });
  const base = `http://${options.host}:${String(running.port)}`;
  console.log(`[registry] serving on ${base}`);
  console.log(`  index:   ${base}/registry.json`);
  console.log(`  item:    ${base}/r/data-table.json`);
  console.log(`  intent:  ${base}/DESIGN.md`);
  console.log(`  install: npx shadcn@latest add ${base}/r/data-table.json`);

  const stop = (): void => {
    running.server.close(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  await new Promise((sleep) => setTimeout(sleep, Number.POSITIVE_INFINITY));
}

export async function startMcp(options: McpOptions): Promise<void> {
  if (options.check) {
    const sorted = toolNamesOf(createServer());
    const expected = [...TOOL_NAMES].sort();
    const ok = sorted.length === expected.length && sorted.every((name, index) => name === expected[index]);
    console.log(`[mcp] tools registered: ${sorted.join(', ') || '(none)'}`);
    process.exitCode = ok ? 0 : 1;
    return;
  }
  process.exitCode = forward(process.execPath, [join(workspaceRoot, 'packages/mcp-server/dist/main.js')]);
}

export function doctorReport(options: DoctorOptions): void {
  const rootManifest = JSON.parse(readFileSync(join(workspaceRoot, 'package.json'), 'utf8')) as { engines?: Record<string, string> };
  const major = Number(process.versions.node.split('.')[0] ?? '0');
  const minor = Number(process.versions.node.split('.')[1] ?? '0');
  const nodeOk = major >= 26 || (major === 24 && minor >= 11) || (major === 22 && minor >= 11);

  const artifacts = [
    ['Intent SSOT', 'DESIGN.md'],
    ['DTCG artifact', 'packages/tokens/tokens.json'],
    ['Token CSS', 'packages/tokens/dist/css/index.css'],
    ['Tailwind theme', 'packages/tokens/tailwind/theme.css'],
    ['Component metadata', 'packages/contracts/generated/component-metadata.json'],
    ['OpenAPI data-table', 'packages/contracts/openapi/data-table.json'],
    ['Generated MSW handlers', 'packages/contracts/generated/handlers.mjs'],
    ['Registry index', 'packages/registry/registry/registry.json'],
  ] as const;

  const report = {
    node: process.versions.node,
    enginesContract: rootManifest.engines?.node ?? 'MISSING',
    nodeCompatible: nodeOk,
    workspaceRoot: rel(workspaceRoot),
    packages: ['engine', 'tokens', 'primitives', 'ui', 'contracts', 'registry', 'mcp-server', 'cli'],
    artifacts: artifacts.map(([name, path]) => ({ name, path, exists: existsSync(join(workspaceRoot, path)) })),
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    console.log(`node            ${report.node} ${nodeOk ? '✓' : `✗ requires ${String(report.enginesContract)}`}`);
    console.log(`engines contract  ${String(report.enginesContract)}`);
    console.log(`packages          ${report.packages.join(', ')}`);
    for (const artifact of report.artifacts) {
      console.log(`artifact          ${artifact.exists ? '✓' : '✗'} ${artifact.name.padEnd(24)} ${artifact.path}`);
    }
  }
  process.exitCode = nodeOk && report.artifacts.every((artifact) => artifact.exists) ? 0 : 1;
}

export async function runGates(options: GateOptions): Promise<void> {
  const tier = Number(options.tier);
  const files: Record<number, string> = {
    1: 'tier1-precommit.mjs',
    2: 'tier2-designmd.mjs',
    3: 'tier3-standard.mjs',
    4: 'tier4-release.mjs',
  };
  const file = files[tier];
  if (file === undefined) {
    console.error(`designharness: --tier must be 1, 2, 3 or 4 (received "${options.tier}")`);
    process.exitCode = 2;
    return;
  }
  const script = join(workspaceRoot, 'tooling/gates', file);
  if (!existsSync(script)) {
    console.error(`designharness: gate ${file} is not installed at ${rel(script)}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = forward(process.execPath, [script]);
}

export async function startGui(options: GuiOptions = {}): Promise<void> {
  const port = options.port ? parseInt(options.port, 10) : 8787;
  if (isNaN(port) || port <= 0 || port > 65535) {
    console.error(`designharness: invalid port "${String(options.port)}" (must be 1-65535)`);
    process.exitCode = 2;
    return;
  }

  if (options.force) {
    killProcessOnPort(port);
  }

  console.log(`designharness: starting Web GUI (Showcase & Component Studio) at http://localhost:${port} ...`);
  const env = { ...process.env, PORT: String(port) };
  process.exitCode = forward(
    'pnpm',
    ['--filter', '@designharness/showcase', 'dev', '--', '--port', String(port)],
    workspaceRoot,
    env,
  );
}
