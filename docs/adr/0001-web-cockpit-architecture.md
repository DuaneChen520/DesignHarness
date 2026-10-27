# Web Cockpit Architecture and Handoff Model

To eliminate developer context switching between conversational AI, terminal commands, and visual verification, we decided to extend `apps/showcase` with Vite Node API middleware and a `/dashboard` route, binding external Target Projects via deep links without forcing Monorepo consolidation. This provides a bidirectional execution console where developers can visually tune tokens, inject components, and track refactoring gates in real time.

## Status

Accepted

## Considered Options

- Dedicated standalone full-stack service (`packages/cockpit`): Rejected due to duplicate dependencies, separate port conflicts, and added CI/runtime overhead.
- Monorepo forced consolidation: Rejected because Target Projects like `carweb` have independent lifecycles, Git remotes, and deployment targets.
- Read-only dashboard: Rejected because forced fallback to CLI commands for rebuilds and gate runs would retain the original context-switching friction.

## Consequences

- `apps/showcase` gains local dev server API endpoints (via Vite plugin `configureServer`) capable of calling `@designharness/engine` in-process.
- Deep links can mount arbitrary external filesystem paths, requiring path validation and git safety guards before performing write operations.
