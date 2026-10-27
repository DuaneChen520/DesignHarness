# DesignHarness

The engineering base and governance pipeline for token-driven, contract-verified design systems and downstream application refactoring.

## Language

**Harness Cockpit**:
The unified local Web console hosted by `designharness` (`apps/showcase`), providing visual token labs, component sandboxes, progress tracking, and gate enforcement.
_Avoid_: Admin dashboard, backend, portal

**Target Project**:
An external downstream application codebase (such as `carweb`) that consumes tokens and components, and is audited by the harness.
_Avoid_: Client project, subproject, slave repo

**Intent Genesis**:
The initial alignment phase (Stage 0) where brand intent and domain ergonomics are elicited via structured interview and formalized into `DESIGN.md`.
_Avoid_: Brainstorming, prompt session

**Handoff Deep Link**:
A URL generated at the conclusion of Intent Genesis that boots or connects to the local Cockpit with the target project context bound.
_Avoid_: Redirect URL, callback link

**Sensor Gate**:
An automated static or dynamic quality gate (Tier 1 AST, Tier 2 Intent, Tier 3 a11y, Tier 4 Release) verifying conformance against design contracts.
_Avoid_: Linter check, CI test

**Dual-Vector Metric**:
An automated refactoring health calculation derived from component standardization ratio and AST token purity.
_Avoid_: Manual checklist, progress percentage

**Mutation Safety Guard**:
A pre-write gate requiring visual side-by-side diff confirmation and a clean Git working tree before mutating target project files.
_Avoid_: Direct write, silent overwrite

**In-Process Engine Dispatcher**:
Direct execution of `@designharness/engine` within the Vite dev server process via TypeScript APIs, streaming logs via SSE.
_Avoid_: CLI child process, spawn executor
