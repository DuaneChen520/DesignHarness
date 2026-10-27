/**
 * `@designharness/mcp` public surface.
 *
 * The harness ships the MCP layer as both a binary (`designharness-mcp`, stdio) and a library
 * (embed the server in another process — that is how `designharness mcp start --http` and the
 * CLI's own smoke checks reuse it without spawning a child).
 */
export { createServer, SERVER_INSTRUCTIONS, SERVER_NAME, SERVER_VERSION, toolNamesOf } from './server.js';
export { LIST_COMPONENTS_TOOL, QUERY_TOKEN_TOOL, TOOL_NAMES, queryTokenInputSchema, registerTools } from './tools.js';
export type { QueryTokenInput } from './tools.js';
export { SURFACES, UnknownRoleError, knownRoles, resolveSemanticRole, semanticSurface, tokenTier } from './token-catalog.js';
export type { Surface, ResolvedRole, RolePair } from './token-catalog.js';
export { buildCatalog } from './component-catalog.js';
export type { Catalog, CatalogComponent, ComponentA11y, ComponentStatus } from './component-catalog.js';
