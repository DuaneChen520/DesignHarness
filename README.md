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

| Path | Package | Role |
| :--- | :--- | :--- |
| `DESIGN.md` | — | **Intent SSOT**: frontmatter tokens + the 8 canonical prose sections |
| `packages/engine` | `@designharness/engine` | DESIGN.md parsing/lint, DTCG 2025.10 export, OKLCH/WCAG/APCA maths, Style Dictionary pipeline, ts-morph prop extraction, registry builders, contrast gate |
| `packages/tokens` | `@designharness/tokens` | **Artifact SSOT**: `tokens.json` → CSS custom properties, Tailwind v4 `@theme`, JSON, TS recipe. `TOKEN-API.md` is the frozen interop contract |
| `packages/primitives` | `@designharness/primitives` | Unstyled, attribute-only components on Zag.js 1.46 state machines (Button, Input, Combobox, Dialog, DataTable) |
| `packages/ui` | `@designharness/ui` | The same five components styled exclusively with tokens; CSF 3.0 stories live beside them |
| `packages/contracts` | `@designharness/contracts` | OpenAPI 3.1 documents, `@msw/source` handlers generated from them, zod guards, ts-morph metadata |
| `packages/registry` | `@designharness/registry` | shadcn-compatible `registry.json` source distribution + HTTP server |
| `packages/mcp-server` | `@designharness/mcp` | MCP server exposing `list_components` and `query_token` |
| `packages/cli` | `designharness` | Unified CLI over tokens / metadata / registry / mcp / gates / doctor |
| `apps/showcase` | `@designharness/showcase` | Fixture host for the axe-core WCAG 2.2 AA gate, the APG keyboard spec and Playwright visual baselines |
| `tooling/gates` | — | The four tier gates (`verify-all.mjs` runs them in order) |

## Stack (pinned in `pnpm-workspace.yaml`)

Zag.js 1.46 state machines (`useMachine`) drive every component; Ark UI 5.39 supplies the
`usePresence` exit-animation hook (Ark pins Zag 1.45 internally, so only one machine version
runs). Style Dictionary 5.7.1, Tailwind CSS 4.3, MSW 3.0 + `@msw/source` 0.7, ts-morph 28,
zod 4.6, axe-core 4.14, Playwright 1.64, React 19.3.

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
