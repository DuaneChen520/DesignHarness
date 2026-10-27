/**
 * MCP server assembly: the harness's AI-facing delivery surface (RESEARCH.md §8.3).
 *
 * `createServer()` is transport-agnostic so the same instance backs the stdio binary and the
 * in-memory test client — there is no "test mode" fork of the logic.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools.js';

export const SERVER_NAME = '@designharness/mcp' as const;
export const SERVER_VERSION = '0.1.0' as const;

export const SERVER_INSTRUCTIONS = [
  'Meridian design-system harness. Two tools only.',
  'list_components() returns the shipped components with their prop contracts and WCAG 2.2 AA gate status.',
  'query_token({ semantic_role, surface }) returns the deterministic CSS custom property + OKLCH value for one semantic role on one surface.',
  'Never invent token names or colours: resolve them through query_token, and consume tokens via var(--…) only.',
].join(' ');

/** Build the server with both tools registered. */
export function createServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION, title: 'Meridian Design System Harness' },
    { instructions: SERVER_INSTRUCTIONS, capabilities: { tools: {} } },
  );
  registerTools(server);
  return server;
}

/**
 * The names registered on a server instance. `McpServer` keeps them in a private field, so the
 * SDK's own introspection is reached through one narrow cast here — inside the package that owns
 * the SDK dependency — rather than leaking that knowledge into the CLI.
 */
export function toolNamesOf(server: McpServer): string[] {
  const registered = (server as unknown as { _registeredTools?: Record<string, unknown> })._registeredTools;
  return Object.keys(registered ?? {}).sort();
}

export { registerTools, LIST_COMPONENTS_TOOL, QUERY_TOKEN_TOOL, TOOL_NAMES, queryTokenInputSchema } from './tools.js';
export type { QueryTokenInput } from './tools.js';
export * from './token-catalog.js';
export * from './component-catalog.js';
