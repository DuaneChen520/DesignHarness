# DesignHarness

> **Token-driven, headless, contract-verified design system engineering base.**  
> 基于设计意图驱动、无头状态机、强类型契约校验与四级自动化门禁的设计系统工程底座。

---

## English

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
# Requirements: Node.js ^22.11 || ^24, pnpm 9.15.9
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

## 中文说明

### 项目概述

DesignHarness 不是简单的 UI 组件模板，而是一套严谨的**设计系统工程底座**。品牌设计意图仅需在 [`DESIGN.md`](./DESIGN.md) 中声明一次，下游所有衍生资产（设计令牌、跨端样式表、无头状态机、OpenAPI 契约拦截器、组件分发注册表和 AI MCP 工具）均由流水线自动生成，并受到四级质量传感器的刚性约束。

### 核心特性

- **单一事实来源 (Intent SSOT)**：以 `DESIGN.md` 为核心，自动推导全色阶与 W3C DTCG 2025.10 规范文件；禁止人工直接修改派生文件，构建脚本会自动比对阻断。
- **多端 Token 分发**：原生支持 Web（CSS 变量、Tailwind v4 主题）、预处理器（SCSS 变量及映射表）、Android（Jetpack Compose `Color.kt`）及 iOS（SwiftUI `ColorAsset.swift`）。
- **原生直连 Zag.js 状态机**：无头 Primitives 层直接绑定 Zag.js 1.46 有限状态机，杜绝多层包装损耗，原生达成 WAI-ARIA APG 无障碍键盘与交互行为。
- **契约驱动组件交互**：OpenAPI 3.1 规格驱动，自动化生成 MSW 3.0 Mock Handlers 与开箱即用的类型安全 TanStack Query 钩子（`useDataTableQuery`、`useComboboxSearchQuery`）。
- **AI Agent 工具支持**：内置 MCP (Model Context Protocol) 服务端，支持 AI 助手即时检索组件元数据与 Token 配置。

### 快速开始

```bash
# 环境要求：Node.js ^22.11 || ^24, pnpm 9.15.9
pnpm install
pnpm build          # Turbo 全量构建
pnpm test           # 运行全工作区单元与集成测试
pnpm verify         # 运行四级全量质量传感器
```

### 四级质量门禁体系

| 级别 | 触发命令 | 检查机制 | 覆盖内容 |
| :--- | :--- | :--- | :--- |
| **Tier 1** | `pnpm gate:tier1` | Pre-commit 语法树 | Stylelint/ESLint 彻底拦截硬编码颜色、px 像素和 `!important`。 |
| **Tier 2** | `pnpm gate:tier2` | 意图防漂移 | 使用 `@google/design.md` 官方检查器验证设计文档结构与规范。 |
| **Tier 3** | `pnpm gate:tier3` | 类型与无障碍 | 全仓 TypeScript 严格类型检查 + axe-core WCAG 2.2 AA 刚性扫描（0 违规）。 |
| **Tier 4** | `pnpm gate:tier4` | 端到端发布校验 | Token 编译幂等性校验、OpenAPI 浏览器回环测试、Playwright 像素级视觉回归。 |

### 命令行工具 (`dh`)

```bash
pnpm dh --help          # 查看命令行帮助（支持 dh 与 designharness 双别名）
pnpm dh doctor          # 执行运行环境与工程制品健康体检
pnpm dh tokens build    # 重新编译 DESIGN.md 为全平台产物
pnpm dh registry serve  # 启动兼容 shadcn 规范的 HTTP 注册表
pnpm dh mcp             # 启动供 AI Agent 使用的 MCP 协议服务
```

---

## License

[Apache-2.0](./LICENSE) © DuaneChen520
