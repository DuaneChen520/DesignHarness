import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const packageRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspaceRoot = resolve(packageRoot, '..', '..');
const cliEntry = join(packageRoot, 'dist', 'index.js');

interface Invocation {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

function cli(...args: string[]): Invocation {
  const result = spawnSync(process.execPath, [cliEntry, ...args], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    timeout: 300_000,
  });
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

beforeAll(() => {
  expect(existsSync(cliEntry), `run \`pnpm --filter designharness build\` first — ${cliEntry} is missing`).toBe(true);
});

describe('command surface', () => {
  it('prints the full command tree', () => {
    const help = cli('--help');
    expect(help.status).toBe(0);
    for (const command of ['tokens', 'metadata', 'registry', 'mcp', 'doctor', 'gates']) {
      expect(help.stdout).toContain(command);
    }
    const tokens = cli('tokens', '--help');
    expect(tokens.status).toBe(0);
    for (const sub of ['build', 'lint', 'diff', 'audit-contrast']) {
      expect(tokens.stdout).toContain(sub);
    }
  });

  it('exits non-zero on an unknown command (strict CLI, no silent typos)', () => {
    const result = cli('buld');
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/unknown|not a command|error/i);
  });

  it('exits non-zero when a required option is missing', () => {
    expect(cli('metadata', 'extract').status).not.toBe(0);
    expect(cli('gates', 'run').status).not.toBe(0);
    expect(cli('gates', 'run', '--tier', '7').status).toBe(2);
  });
});

describe('doctor', () => {
  it('reports the Node engines contract and every artifact', () => {
    const result = cli('doctor', '--json');
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout) as {
      node: string;
      enginesContract: string;
      nodeCompatible: boolean;
      packages: string[];
      artifacts: Array<{ name: string; path: string; exists: boolean }>;
    };
    expect(report.node).toBe(process.versions.node);
    expect(report.enginesContract).toBe('^22.11 || ^24 || >=26');
    expect(report.nodeCompatible).toBe(true);
    expect(report.packages).toEqual(['engine', 'tokens', 'primitives', 'ui', 'contracts', 'registry', 'mcp-server', 'cli']);
    const names = report.artifacts.map((artifact) => artifact.name);
    for (const required of ['Intent SSOT', 'DTCG artifact', 'Token CSS', 'Tailwind theme', 'OpenAPI data-table', 'Generated MSW handlers', 'Registry index']) {
      expect(names, `doctor must report on "${required}"`).toContain(required);
    }
    for (const artifact of report.artifacts) {
      expect(artifact.exists, `artifact missing: ${artifact.name} (${artifact.path})`).toBe(true);
    }
  });
});

describe('intent gate', () => {
  it('lints the real DESIGN.md through the official linter', () => {
    const result = cli('tokens', 'lint', '--json');
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout) as { lint: { errors: number; warnings: number; findings: unknown[] } };
    expect(report.lint.errors).toBe(0);
    expect(Array.isArray(report.lint.findings)).toBe(true);
  });

  it('fails on an intent file with a broken token reference', () => {
    const bad = 'packages/cli/test/fixtures/broken-DESIGN.md';
    expect(existsSync(join(workspaceRoot, bad)), 'the broken-intent fixture is missing — the gate has no negative control').toBe(true);
    const result = cli('tokens', 'lint', '--design', bad, '--json');
    expect(result.status, 'a broken Intent file must exit non-zero').not.toBe(0);
    const report = JSON.parse(result.stdout) as { lint: { errors: number; findings: Array<{ rule?: string }> } };
    expect(report.lint.errors).toBeGreaterThan(0);
    expect(report.lint.findings.some((finding) => finding.rule === 'broken-ref' || finding.rule === 'invalid-ref')).toBe(true);
  });

  it('audits WCAG 2.2 contrast over the compiled artifact, reporting APCA without gating', () => {
    const result = cli('tokens', 'audit-contrast', '--json');
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout) as { standard: string; passed: boolean; audited: number; failures: unknown[]; apcaWarnings: unknown[] };
    expect(report.standard).toBe('WCAG 2.2 AA');
    expect(report.passed).toBe(true);
    expect(report.failures).toEqual([]);
    expect(report.audited).toBeGreaterThan(10);
    expect(Array.isArray(report.apcaWarnings)).toBe(true);
  });
});

describe('delivery commands', () => {
  it('builds the registry and leaves it consumable', () => {
    const result = cli('registry', 'build');
    expect(result.status, result.stderr).toBe(0);
    const index = JSON.parse(readText(join(workspaceRoot, 'packages/registry/registry/registry.json'))) as { items: Array<{ name: string; type: string }> };
    expect(index.items.map((item) => item.name)).toEqual(
      expect.arrayContaining(['button', 'input', 'combobox', 'dialog', 'data-table', 'meridian-base', 'meridian-style']),
    );
  });

  it('verifies both MCP tools register without spawning a child', () => {
    const result = cli('mcp', 'start', '--check');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('list_components');
    expect(result.stdout).toContain('query_token');
  });

  it('extracts Props metadata from the ui package', () => {
    const result = cli('metadata', 'extract', '--dir', 'packages/ui/src', '--tsconfig', 'packages/ui/tsconfig.json');
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout) as { count: number; components: Array<{ id: string; props: Array<{ name: string; type: string }> }> };
    expect(report.count).toBeGreaterThanOrEqual(5);
    const ids = report.components.map((component) => component.id);
    expect(ids).toEqual(expect.arrayContaining(['button', 'input', 'combobox', 'dialog', 'data-table']));
    for (const component of report.components) {
      expect(component.props.length, `${component.id} extracted no props`).toBeGreaterThan(0);
      for (const prop of component.props) {
        expect(typeof prop.type, `${component.id}.${prop.name} has no resolved type`).toBe('string');
        expect(prop.type.length).toBeGreaterThan(0);
      }
    }
  });
});

function readText(path: string): string {
  return readFileSync(path, 'utf8');
}
