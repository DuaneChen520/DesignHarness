#!/usr/bin/env node
/**
 * `designharness` — the unified CLI (RESEARCH.md §10, objective item 6).
 *
 * Every subcommand delegates to a real implementation: the engine for intent/token/AST work,
 * the tokens package's build script for the compile, the registry builder/server for source
 * distribution, the MCP server for the AI surface, and `tooling/gates` for the tiered sensors.
 * Nothing here reimplements logic, so the CLI can never disagree with the library.
 */
import { Command } from 'commander';
import { runTokensBuild, runRegistryBuild, serveRegistry, startMcp, runGates, doctorReport, lintIntentJson, auditContrastJson, extractMetadata, diffIntent } from './actions.js';

const PROGRAM_NAME = 'designharness';

export function buildProgram(): Command {
  const program = new Command(PROGRAM_NAME)
    .description('Design System Harness — token compilation, intent gates, contract mocks, registry and MCP delivery.')
    .version('0.1.0', '-v, --version', 'harness version')
    .showHelpAfterError('run `designharness --help` for the command tree');

  const tokens = program.command('tokens').description('Design token pipeline (DESIGN.md → DTCG 2025.10 → CSS / Tailwind / TS).');
  tokens
    .command('build')
    .description('Compile DESIGN.md into tokens.json and every platform output via Style Dictionary.')
    .option('--design <path>', 'intent file to compile', 'DESIGN.md')
    .option('--dry-run', 'compile into a temp dir without writing artifacts', false)
    .action(async (options: { design: string; dryRun: boolean }) => runTokensBuild(options));
  tokens
    .command('lint')
    .description('Run the official @google/design.md linter against the Intent SSOT (exit 1 on errors).')
    .option('--design <path>', 'intent file to lint', 'DESIGN.md')
    .option('--json', 'print the machine-readable report', false)
    .action(async (options: { design: string; json: boolean }) => lintIntentJson(options));
  tokens
    .command('diff')
    .description('Diff two intent revisions to detect unintended design drift.')
    .argument('<other>', 'the other DESIGN.md revision')
    .option('--design <path>', 'the baseline intent file', 'DESIGN.md')
    .action(async (other: string, options: { design: string }) => diffIntent(other, options));
  tokens
    .command('audit-contrast')
    .description('Audit WCAG 2.2 AA contrast over the compiled artifact (APCA reported, never gating).')
    .option('--json', 'print the audit as JSON', false)
    .action(async (options: { json: boolean }) => auditContrastJson(options));

  const metadata = program.command('metadata').description('Component prop contract extraction (ts-morph).');
  metadata
    .command('extract')
    .description('Extract Props metadata from a source directory.')
    .requiredOption('--dir <path>', 'directory of .tsx components')
    .option('--tsconfig <path>', 'tsconfig to resolve imported types')
    .option('--out <path>', 'write component-metadata.json here')
    .action(async (options: { dir: string; tsconfig?: string; out?: string }) => extractMetadata(options));

  const registry = program.command('registry').description('shadcn-compatible registry distribution.');
  registry
    .command('build')
    .description('Emit registry.json and one item document per component.')
    .option('--out <path>', 'output directory', 'packages/registry/registry')
    .action(async (options: { out: string }) => runRegistryBuild(options));
  registry
    .command('serve')
    .description('Serve the built registry so `npx shadcn add <url>` can consume it.')
    .option('--port <number>', 'port', '4870')
    .option('--host <host>', 'bind address', '127.0.0.1')
    .action(async (options: { port: string; host: string }) => serveRegistry(options));

  const mcp = program.command('mcp').description('Model Context Protocol server for AI-assisted development.');
  mcp
    .command('start')
    .description('Start the MCP server on stdio (list_components, query_token).')
    .option('--check', 'register the tools and exit 0 only if both resolve', false)
    .action(async (options: { check: boolean }) => startMcp(options));

  program
    .command('doctor')
    .description('Report the environment against the harness contract (Node engines, workspace, artifacts).')
    .option('--json', 'print JSON', false)
    .action((options: { json: boolean }) => doctorReport(options));

  const gates = program.command('gates').description('Tiered quality sensors (RESEARCH.md §7).');
  gates
    .command('run')
    .description('Execute one tier: 1 pre-commit AST, 2 intent, 3 standard (tsc + axe), 4 release.')
    .requiredOption('--tier <1|2|3|4>', 'gate tier to run')
    .action(async (options: { tier: string }) => runGates(options));

  return program;
}

export async function run(argv: readonly string[]): Promise<number> {
  const program = buildProgram();
  try {
    await program.parseAsync([...argv], { from: 'user' });
    // Actions set `process.exitCode` directly (including 2 for usage errors), so the real code
    // must be forwarded rather than collapsed into a single "failed" value.
    const code = typeof process.exitCode === 'number' ? process.exitCode : 0;
    return code;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${PROGRAM_NAME}: ${message}\n`);
    return 1;
  }
}

const invokedDirectly = process.argv[1] !== undefined && /(?:^|[\\/])index\.js$/.test(process.argv[1]);
if (invokedDirectly) {
  run(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      process.stderr.write(`${PROGRAM_NAME}: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
