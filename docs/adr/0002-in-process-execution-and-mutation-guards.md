# In-Process Engine Dispatching, Mutation Safety, and Dual-Vector Refactoring Metrics

To enable safe, high-speed execution inside the Web Cockpit, we decided to invoke `@designharness/engine` in-process via Vite Node middleware with SSE log streaming, enforce mandatory Diff modals and Git dirty checks before writing to Target Projects, measure refactoring progress via AST-derived dual-vector metrics, and encapsulate Stage 0 into a canonical `dh-intent` Skill.

## Status

Accepted

## Considered Options

- Spawning `dh` CLI child processes: Rejected due to Windows argument concatenation vulnerabilities, subprocess startup latency, and unformatted stdout parsing.
- Silent file overwriting on Target Projects: Rejected because unattended mutations risk corrupting uncommitted code in business repositories.
- Manual refactoring checklists: Rejected because self-reported progress drifts and lacks compiler-level verification.

## Consequences

- The Cockpit backend requires a Vite plugin implementing Server-Sent Events (SSE) for log streaming and AST scanning endpoints.
- All file writes to external projects are routed through a staging diff preview.
- A standardized `dh-intent` Skill is created with domain question banks.
