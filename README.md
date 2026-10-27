# Design System Harness

A token-driven, headless, contract-verified design-system engineering base — not a template.
Brand intent is declared once in `DESIGN.md`; everything downstream (tokens, component
styles, contracts, registry, MCP tools) is generated from it and re-verified by tiered
sensors. `RESEARCH.md` holds the specification this repository implements.

## Requirements

- Node.js `^22.11` (the supported floor; the `engines` field also admits `^24` / `>=26`)
- pnpm `9.15.9` (pinned via `packageManager`)

```bash
pnpm install
pnpm build          # turbo: every package, including the token pipeline
pnpm test           # unit + integration (9 workspaces)
pnpm verify         # Tier 1 → 4 sensors (see below)
```

## Layout

The design system harness is organized into a canonical 4-layer decoupled physical topology alongside tooling, CLI, and distribution workspaces:

| Layer | Path | Package | Role |
| :--- | :--- | :--- | :--- |
| **Layer 1: Headless Primitives** | `packages/primitives` | `@designharness/primitives` | Unstyled, attribute-only components directly bound to Zag.js 1.46 state machines (Button, Input, Combobox, Dialog, DataTable). Eliminates Ark UI component wrapper indirection. |
| **Layer 2: Tokenized UI** | `packages/ui` | `@designharness/ui` | The same five components styled exclusively with design tokens; CSF 3.0 stories live beside them. |
| **Layer 3: Delivery Contracts** | `packages/contracts` | `@designharness/contracts` | OpenAPI 3.1 documents, `@msw/source` handlers generated from them, zod guards, React Props AST metadata (`component-metadata.json`), and TanStack Query hooks (`useDataTableQuery`, `useComboboxSearchQuery`). |
| **Layer 4: Verification Showcase** | `apps/showcase` | `@designharness/showcase` | Fixture host for the axe-core WCAG 2.2 AA gate, the APG keyboard spec and Playwright visual baselines. |

### Supporting Engine, Tokens, and Delivery

| Path | Package | Role |
| :--- | :--- | :--- |
| `DESIGN.md` | — | **Intent SSOT**: frontmatter tokens + the 8 canonical prose sections |
| `packages/engine` | `@designharness/engine` | Algorithmic DTCG expansion layer converting `DESIGN.md` intent into concrete DTCG 2025.10 tokens; OKLCH/WCAG/APCA maths, Style Dictionary multi-platform pipeline, ts-morph React Props AST extraction, registry builders, contrast gate |
| `packages/tokens` | `@designharness/tokens` | **Artifact SSOT**: `tokens.json` → CSS custom properties, Tailwind v4 `@theme`, SCSS (`_tokens.scss`), Android Compose (`Color.kt`), iOS Swift (`ColorAsset.swift`), JSON, TS recipe. `TOKEN-API.md` is the frozen interop contract |
| `packages/registry` | `@designharness/registry` | shadcn-compatible `registry.json` source distribution + HTTP server |
| `packages/mcp-server` | `@designharness/mcp` | MCP server exposing `list_components` and `query_token` |
| `packages/cli` | `designharness` | Unified CLI over tokens / metadata / registry / mcp / gates / doctor |
| `tooling/gates` | — | The four tier gates (`verify-all.mjs` runs them in order) |

## Stack (pinned in `pnpm-workspace.yaml`)

Zag.js 1.46 state machines (`@zag-js/*`, `useMachine`) drive every headless primitive directly, eliminating intermediate Ark UI component abstractions while retaining pure statechart-driven ARIA compliance. Ark UI 5.39 supplies exclusively the `usePresence` exit-animation hook for dialog teardown transitions. Style Dictionary 5.7.1 powers multi-platform token compilation, Tailwind CSS 4.3, MSW 3.0 + `@msw/source` 0.7, TanStack Query 5 (`@tanstack/react-query`), ts-morph 28, zod 4.6, axe-core 4.14, Playwright 1.64, React 19.3.

## Architectural Decision Records (ADRs)

1. **Direct Zag.js 1.46 State Machine Binding (vs. Ark UI Component Wrappers)**:  
   Primitives in `packages/primitives` bind directly to Zag.js 1.46 finite state machines (`@zag-js/button`, `@zag-js/dialog`, `@zag-js/combobox`, etc.). Rather than wrapping Ark UI anatomical components (which would introduce multi-layer component indirection and dual abstraction overhead), we author unstyled, attribute-only primitives directly against Zag machines while using Ark UI strictly for the `usePresence` transition hook.
2. **Canonical 4-Layer Decoupled Physical Topology**:  
   Codebase strictly separates concerns into four distinct physical layers: `packages/primitives` (headless state machines & ARIA logic) $\rightarrow$ `packages/ui` (token-bound styling & CSF 3.0 stories) $\rightarrow$ `packages/contracts` (OpenAPI 3.1 specs, `@msw/source` mock generation, TanStack Query integration hooks, and React Props AST metadata) $\rightarrow$ `apps/showcase` (fixture host for WCAG 2.2 AA and visual regression gates).
3. **Algorithmic DTCG Expansion Layer**:  
   The token compilation pipeline in `@designharness/engine` provides an intentional translation layer that parses `DESIGN.md` intent frontmatter and mathematically derives full OkLCH scales, elevation shadows, spatial scales, and semantic tokens into concrete W3C DTCG 2025.10 artifacts before passing them to Style Dictionary.
4. **Multi-Platform Token Export Engine**:  
   In addition to web-first CSS custom properties and Tailwind v4 themes, `@designharness/tokens` delivers production-ready targets for SCSS preprocessors (`dist/scss/_tokens.scss`), Android Jetpack Compose (`dist/compose/Color.kt`), and iOS SwiftUI (`dist/swift/ColorAsset.swift`).
5. **Contract-Driven Asynchronous Query Integration**:  
   `packages/contracts` exports production-ready, type-safe TanStack Query hooks (`useDataTableQuery`, `useComboboxSearchQuery`) that synchronize component state with OpenAPI 3.1 operation definitions, automatically backed by `@msw/source` mock interceptors in development and testing.
6. **React Props AST Metadata (over Web Components CEM)**:  
   Component metadata (`packages/contracts/generated/component-metadata.json`) is extracted directly from React TypeScript sources via `ts-morph` AST analysis (capturing prop names, types, optionality, JSDoc tags, and defaults). The harness deliberately produces React Props AST metadata rather than Web Components Custom Elements Manifest (CEM) to maintain 100% fidelity with the actual React component architecture.

## Single source of truth

- `DESIGN.md` is the only hand-edited input. `packages/tokens/tokens.json` is machine
  output; the build refuses to run when it was hand-edited (byte comparison against a
  fresh regeneration, with a diff summary).
- To change intent: edit `DESIGN.md`, then `pnpm tokens -- --write`.
- `packages/tokens/TOKEN-API.md` freezes the public custom-property names, anatomy and
  metadata conventions that the other packages compile against.

## Quality sensors

| Tier | Command | Blocks | Contents |
| :--- | :--- | :--- | :--- |
| 1 | `pnpm gate:tier1` | commit | Stylelint (hardcoded colour / px / `!important` / token reference) + ESLint colour literals |
| 2 | `pnpm gate:tier2` | merge | `@google/design.md` lint + drift diff over the intent file |
| 3 | `pnpm gate:tier3` | merge | `tsc --noEmit` in every workspace + axe-core with the explicit `wcag22aa` tag (SC 2.5.8 `target-size` included). APCA `Lc` is published to `packages/tokens/reports/apca-advisories.json` as a diagnostic and can never gate |
| 4 | `pnpm gate:tier4` | release | Full build + all tests + token idempotence + browser contract round-trip + pixel regression |

`pnpm verify` runs all four and prints one summary table; `pnpm test:e2e` runs just the
Playwright specs. WCAG 2.2 is the only rigid contrast gate — APCA never blocks a merge.
Install the commit hook with `git config core.hooksPath .githooks`; CI
(`.github/workflows/ci.yml`) runs Tiers 1–2 and 3 on every PR and Tier 4 nightly / on tags.

## Working with it

```bash
pnpm designharness --help          # CLI command tree
pnpm designharness tokens build    # compile DESIGN.md → artifacts
pnpm designharness doctor          # Node engines + workspace + artifact report
pnpm designharness registry serve  # shadcn registry over HTTP
pnpm designharness mcp start       # MCP server over stdio
```

Consuming applications import `@designharness/ui/styles.css` once and reference
`@designharness/tokens/css` for the cascade (`:root`, `[data-theme]`, `prefers-color-scheme`
and the high-contrast modes). Fonts fall back through `--font-family-body` /
`--font-family-display`; no colour, spacing or radius is authored outside the token layer.
