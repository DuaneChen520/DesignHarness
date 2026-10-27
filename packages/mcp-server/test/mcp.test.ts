/**
 * The MCP surface driven end-to-end through the SDK's own client, over an in-memory transport
 * pair. This is a real protocol conversation (initialize → tools/list → tools/call), not a
 * unit test of a handler function: if the wiring, the schema or the payload shape is wrong,
 * the client sees it.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createServer, LIST_COMPONENTS_TOOL, QUERY_TOKEN_TOOL, SERVER_NAME, TOOL_NAMES } from '../src/index.js';
import { dtcgArtifactPath } from '../src/workspace.js';

const client = new Client({ name: 'harness-test-client', version: '0.0.0' });
let server: ReturnType<typeof createServer>;

beforeAll(async () => {
  server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterAll(async () => {
  await client.close();
  await server.close();
});

/** The MCP tool result body is text content; the harness serialises JSON into it. */
function payload(result: Awaited<ReturnType<Client['callTool']>>): Record<string, unknown> {
  const content = (result as { content: Array<{ type: string; text?: string }> }).content;
  const text = content.find((item) => item.type === 'text')?.text;
  expect(typeof text, 'the tool returned no text content').toBe('string');
  return JSON.parse(String(text)) as Record<string, unknown>;
}

/**
 * The SDK does not reject a failed tool call: an unknown tool, a schema violation and a
 * harness-level "I refuse to guess" all arrive as `isError: true` with a text body. Asserting
 * that channel (rather than `rejects`) is what the protocol actually promises an agent.
 */
async function callToolError(name: string, args: Record<string, unknown>): Promise<string> {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError, `expected ${name} to report an error for ${JSON.stringify(args)}`).toBe(true);
  const body = result as { content: Array<{ type: string; text?: string }> };
  return body.content.map((item) => item.text ?? '').join('\n');
}

describe('MCP handshake and tool surface', () => {
  it('announces exactly the two v1 tools', async () => {
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name).sort();
    expect(names).toEqual([...TOOL_NAMES].sort());
    expect(names).toEqual([LIST_COMPONENTS_TOOL, QUERY_TOKEN_TOOL]);
    for (const tool of listed.tools) {
      expect(tool.description, `${tool.name} needs a description for agents`).toBeTruthy();
      expect(tool.inputSchema?.type, `${tool.name} must publish an input schema`).toBe('object');
    }
  });

  it('reports an unknown tool as an error result rather than inventing one', async () => {
    const text = await callToolError('query_anything', {});
    expect(text.toLowerCase()).toMatch(/unknown tool|not found/);
  });
});

describe('list_components', () => {
  it('returns the shipped components with prop contracts and gate status', async () => {
    const body = payload(await client.callTool({ name: LIST_COMPONENTS_TOOL, arguments: {} }));
    expect(body.standard).toBe('WCAG 2.2 AA');
    const components = body.components as Array<Record<string, unknown>>;
    expect(components.length, 'the catalog resolved no components').toBeGreaterThanOrEqual(5);
    expect(components.map((component) => component.id).sort()).toEqual(['button', 'combobox', 'data-table', 'dialog', 'input']);

    for (const component of components) {
      expect(component.registryType).toBe('registry:component');
      expect(['reviewed', 'provisional', 'blocked']).toContain(component.status);
      expect(component.propCount as number, `${String(component.id)} has no prop contract`).toBeGreaterThan(0);
      const a11y = component.a11y as Record<string, unknown>;
      expect(a11y.standard).toBe('WCAG 2.2 AA');
      expect(a11y.engine).toBe('axe-core');
      const tokens = component.tokens as Record<string, unknown>;
      expect(tokens.referenced as number, `${String(component.id)} stylesheet references no tokens`).toBeGreaterThan(0);
    }

    const counts = body.counts as Record<string, number>;
    expect(counts.components).toBe(components.length);
    expect(counts.reviewed + counts.provisional + counts.blocked).toBe(components.length);

    const intent = body.intent as Record<string, string>;
    expect(intent.file).toBe('DESIGN.md');
    expect(intent.sha256).toHaveLength(64);
  });

  it('reports the built registry so an agent knows what is installable', async () => {
    const body = payload(await client.callTool({ name: LIST_COMPONENTS_TOOL, arguments: {} }));
    const registry = body.registry as { built: boolean; items: string[] };
    expect(registry.built, 'run `pnpm --filter @designharness/registry build` before asserting distribution').toBe(true);
    for (const id of ['button', 'input', 'combobox', 'dialog', 'data-table']) {
      expect(registry.items).toContain(id);
    }
  });
});

describe('query_token', () => {
  it('resolves a semantic role to a deterministic CSS variable and OKLCH value', async () => {
    const body = payload(await client.callTool({ name: QUERY_TOKEN_TOOL, arguments: { semantic_role: 'text-secondary' } }));
    expect(body.semantic_role).toBe('text-secondary');
    expect(body.surface).toBe('light');
    expect(body.css_var).toBe('--color-text-secondary');
    expect(body.usage).toBe('var(--color-text-secondary)');
    expect(body.tier).toBe('semantic');
    expect(String(body.value)).toMatch(/^oklch\(/);
    expect(body.alias_of).toMatch(/^color\.primitive\./);
    const contrast = body.contrast as { standard: string; failures: number; passed: boolean };
    expect(contrast.standard).toBe('WCAG 2.2 AA');
    expect(contrast.failures).toBe(0);
    expect(contrast.passed).toBe(true);
  });

  it('accepts the same role in all three accepted spellings', async () => {
    const spellings = ['text-secondary', 'color-text-secondary', '--color-text-secondary'];
    const bodies = await Promise.all(
      spellings.map(async (spelling) => payload(await client.callTool({ name: QUERY_TOKEN_TOOL, arguments: { semantic_role: spelling } }))),
    );
    for (const body of bodies) expect(body.semantic_role).toBe('text-secondary');
    expect(new Set(bodies.map((body) => body.css_var))).toEqual(new Set(['--color-text-secondary']));
  });

  it('answers the same role differently per surface, straight from the artifact', async () => {
    const light = payload(await client.callTool({ name: QUERY_TOKEN_TOOL, arguments: { semantic_role: 'text-secondary', surface: 'light' } }));
    const dark = payload(await client.callTool({ name: QUERY_TOKEN_TOOL, arguments: { semantic_role: 'text-secondary', surface: 'dark' } }));
    const hc = payload(await client.callTool({ name: QUERY_TOKEN_TOOL, arguments: { semantic_role: 'text-secondary', surface: 'high-contrast' } }));
    expect(dark.dtcg_path).toBe('color.semantic.dark.text-secondary');
    expect(hc.dtcg_path).toBe('color.semantic.highContrast.text-secondary');
    expect(new Set([light.value, dark.value, hc.value]).size).toBe(3);

    const artifact = JSON.parse(readFileSync(dtcgArtifactPath, 'utf8')) as Record<string, unknown>;
    const serialized = JSON.stringify(artifact);
    for (const body of [light, dark, hc]) {
      expect(serialized, `the value ${String(body.value)} is not in the artifact`).toContain(String(body.value));
    }
  });

  it('never guesses: an unknown role is an error with suggestions', async () => {
    const result = await client.callTool({ name: QUERY_TOKEN_TOOL, arguments: { semantic_role: 'text-sekundary' } });
    expect(result.isError).toBe(true);
    const body = payload(result);
    expect(body.error).toBe(true);
    expect(body.requested).toBe('text-sekundary');
    expect(Array.isArray(body.suggestions)).toBe(true);
    expect((body.suggestions as string[]).length).toBeGreaterThan(0);
    expect((body.suggestions as string[])).not.toContain('text-sekundary');
  });

  it('rejects a surface outside the enumerated set instead of silently defaulting', async () => {
    const text = await callToolError(QUERY_TOKEN_TOOL, { semantic_role: 'text-secondary', surface: 'sepia' });
    expect(text).toMatch(/surface/i);
    expect(text).toMatch(/high-contrast/i);
  });

  it('rejects an empty or missing role', async () => {
    expect(await callToolError(QUERY_TOKEN_TOOL, { semantic_role: '' })).toMatch(/semantic_role/i);
    expect(await callToolError(QUERY_TOKEN_TOOL, {})).toMatch(/semantic_role/i);
  });

  it('rejects an unexpected extra argument (strict input schema)', async () => {
    expect(await callToolError(QUERY_TOKEN_TOOL, { semantic_role: 'text-secondary', hex: 'not-in-schema' })).toMatch(/hex|unrecognized|unexpected/i);
  });
});

describe('server identity', () => {
  it('names itself for the client registry', async () => {
    const info = client.getServerVersion();
    expect(info?.name).toBe(SERVER_NAME);
    expect(info?.version).toBe('0.1.0');
  });
});
