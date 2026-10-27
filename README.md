# DesignHarness

> **Token-driven, headless, contract-verified design system engineering base.**

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![English](https://img.shields.io/badge/Language-English-blue)](#)
[![简体中文](https://img.shields.io/badge/文档-简体中文-green)](./README.zh-CN.md)

---

### Overview

DesignHarness is not a UI template. It is an end-to-end design engineering harness where brand intent is declared once in [`DESIGN.md`](./DESIGN.md), and everything downstream (tokens, multi-platform stylesheets, component statecharts, OpenAPI mock handlers, registry schemas, and MCP tools) is derived and verified by tiered quality sensors.

### Architecture

```
DESIGN.md (Intent SSOT)
   │
   ▼
@designharness/engine (Mathematical DTCG derivation)
   │
   ├──▶ @designharness/tokens (Web CSS, Tailwind v4, SCSS, Android Compose, iOS SwiftUI)
   │
   ├──▶ @designharness/primitives (Zag.js 1.46 Headless State Machines + WAI-ARIA APG)
   │       │
   │       ▼
   ├──▶ @designharness/ui (Token-styled UI Components + CSF 3.0 Stories)
   │
   ├──▶ @designharness/contracts (OpenAPI 3.1 + MSW 3.0 + TanStack Query Hooks)
   │
   └──▶ apps/showcase (axe-core WCAG 2.2 AA & Playwright Visual Regression Gates)
```

### Core Capabilities

- **Single Source of Truth**: Brand intent in `DESIGN.md` compiles directly into W3C DTCG 2025.10 tokens. Manual editing of downstream tokens is prohibited and rejected by CI.
- **Multi-Platform Tokens**: Compiles to Web (CSS custom properties, Tailwind v4 `@theme`), preprocessor (SCSS `_tokens.scss`), Android (Jetpack Compose `Color.kt`), and iOS (SwiftUI `ColorAsset.swift`).
- **Direct Zag.js FSM Binding**: Primitives bind directly to Zag.js 1.46 statecharts without intermediate wrapper layers, ensuring predictable keyboard navigation and zero-compromise WAI-ARIA APG semantics.
- **Contract-Driven UI**: OpenAPI 3.1 specifications auto-generate MSW mock handlers and type-safe TanStack Query hooks (`useDataTableQuery`, `useComboboxSearchQuery`).
- **AI Agent Surface**: Built-in Model Context Protocol (MCP) server providing real-time component catalog and token inspection tools for AI coding agents.

### Quick Start

```bash
# Requirements: Node.js ^22.13 || ^24, pnpm 9.15.9
pnpm install
pnpm build          # Turbo build across all 10 packages
pnpm test           # Run unit & integration test suites
pnpm verify         # Run all 4 quality sensor tiers
```

### Tiered Quality Sensors

| Tier | Command | Check | Scope |
| :--- | :--- | :--- | :--- |
| **Tier 1** | `pnpm gate:tier1` | Pre-commit AST | Stylelint & ESLint block hardcoded colors, px, and `!important`. |
| **Tier 2** | `pnpm gate:tier2` | Intent Drift | Official `@google/design.md` linter audits intent conformance. |
| **Tier 3** | `pnpm gate:tier3` | Types & A11y | Monorepo `tsc --noEmit` + axe-core WCAG 2.2 AA audit (0 violations). |
| **Tier 4** | `pnpm gate:tier4` | Release Gates | Token idempotence, contract mock round-trips & Playwright visual regressions. |

### CLI Usage

```bash
pnpm dh --help          # Show CLI commands (also supports alias: designharness)
pnpm dh doctor          # Run environment and artifact integrity checks
pnpm dh tokens build    # Recompile DESIGN.md -> multi-platform tokens
pnpm dh registry serve  # Launch shadcn-compatible HTTP registry
pnpm dh mcp             # Start stdio MCP server for AI agents
```

---

## License

[Apache-2.0](./LICENSE) © DuaneChen520
