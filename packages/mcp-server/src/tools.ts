/**
 * The two MCP tools RESEARCH.md §8.3 scopes for v1 — nothing more:
 *
 *   list_components()  → the reviewed component list and its gate status
 *   query_token({ semantic_role, surface }) → deterministic token resolution
 *
 * `query_token` deliberately收紧 the parameters to a semantic role plus an enumerated
 * surface: an AI agent must not be able to ask a vague question and get a plausible colour.
 * An unknown role is an error with suggestions, never a best guess.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SURFACES, UnknownRoleError, resolveSemanticRole, knownRoles, type Surface } from './token-catalog.js';
import { buildCatalog } from './component-catalog.js';

export const LIST_COMPONENTS_TOOL = 'list_components' as const;
export const QUERY_TOKEN_TOOL = 'query_token' as const;

const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] });
/**
 * Errors are also JSON, so a calling agent can parse `message` / `suggestions` instead of
 * scraping prose. The MCP SDK reports schema-level rejections as an error result too (it does
 * not throw), so this shape is the single failure channel for both layers.
 */
const error = (message: string, details?: Record<string, unknown>) => ({
  isError: true,
  content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message, ...(details ?? {}) }, null, 2) }],
});

export const queryTokenInputSchema = z
  .object({
    semantic_role: z
      .string()
      .min(1)
      .describe(`Semantic colour role, e.g. "${knownRoles().slice(0, 2).join('", "')}". Accepts "text-secondary", "color-text-secondary" or "--color-text-secondary".`),
    surface: z.enum(SURFACES).optional().describe('Surface the token is applied to. Defaults to light.'),
  })
  .strict();

export type QueryTokenInput = z.infer<typeof queryTokenInputSchema>;

/** Register the tools on a server instance. Kept pure so tests can drive it in-memory. */
export function registerTools(server: McpServer): void {
  server.registerTool(
    LIST_COMPONENTS_TOOL,
    {
      title: 'List design system components',
      description:
        'Returns every component the harness ships, with its prop contract, the tokens its stylesheet consumes, and whether it cleared the WCAG 2.2 AA gate. Read-only.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    async () => {
      const catalog = await buildCatalog();
      return text({
        standard: 'WCAG 2.2 AA',
        intent: catalog.intent,
        registry: catalog.registry,
        counts: {
          components: catalog.components.length,
          reviewed: catalog.components.filter((component) => component.status === 'reviewed').length,
          provisional: catalog.components.filter((component) => component.status === 'provisional').length,
          blocked: catalog.components.filter((component) => component.status === 'blocked').length,
        },
        components: catalog.components.map((component) => ({
          id: component.id,
          name: component.name,
          status: component.status,
          registryName: component.registryName,
          registryType: component.registryType,
          distributedInRegistry: component.distributedInRegistry,
          propCount: component.propCount,
          requiredPropCount: component.requiredPropCount,
          eventCount: component.eventCount,
          metadataProvenance: component.metadata.provenance,
          tokens: component.tokens,
          tokensReferenced: component.tokens.referenced,
          a11y: component.a11y,
          props: component.props,
        })),
      });
    },
  );

  server.registerTool(
    QUERY_TOKEN_TOOL,
    {
      title: 'Resolve a semantic design token',
      description:
        'Resolves one semantic colour role in one surface to its compiled token: the CSS custom property to write, the OKLCH value, its tier, the DTCG path it aliases, and the WCAG 2.2 AA contrast pairs it participates in. Never guesses: an unknown role returns an error with the closest known roles.',
      inputSchema: queryTokenInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    async (input: QueryTokenInput) => {
      const surface: Surface = input.surface ?? 'light';
      try {
        const resolved = await resolveSemanticRole(input.semantic_role, surface);
        return text(resolved);
      } catch (cause) {
        if (cause instanceof UnknownRoleError) {
          return error(cause.message, { requested: cause.role, suggestions: cause.suggestions, knownRoleCount: knownRoles().length });
        }
        const message = cause instanceof Error ? cause.message : String(cause);
        return error(`query_token failed: ${message}`, { semantic_role: input.semantic_role, surface });
      }
    },
  );
}

export const TOOL_NAMES = [LIST_COMPONENTS_TOOL, QUERY_TOKEN_TOOL] as const;
