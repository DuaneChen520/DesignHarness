# DesignHarness

> **基于设计意图驱动、无头状态机、强类型契约校验与四级自动化门禁的设计系统工程底座。**

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![English](https://img.shields.io/badge/Language-English-blue)](./README.md)
[![简体中文](https://img.shields.io/badge/文档-简体中文-green)](#)

---

### 项目概述

DesignHarness 不是简单的 UI 组件模板，而是一套严谨的**设计系统工程底座**。品牌设计意图仅需在 [`DESIGN.md`](./DESIGN.md) 中声明一次，下游所有衍生资产（设计令牌、跨端样式表、无头状态机、OpenAPI 契约拦截器、组件分发注册表和 AI MCP 工具）均由流水线自动生成，并受到四级质量传感器的刚性约束。

### 架构拓扑

```
DESIGN.md (设计意图单一信源)
   │
   ▼
@designharness/engine (数学化 DTCG 派生引擎)
   │
   ├──▶ @designharness/tokens (Web CSS, Tailwind v4, SCSS, Android Compose, iOS SwiftUI)
   │
   ├──▶ @designharness/primitives (Zag.js 1.46 无头状态机 + WAI-ARIA APG)
   │       │
   │       ▼
   ├──▶ @designharness/ui (Token 绑定的 UI 组件 + CSF 3.0 故事)
   │
   ├──▶ @designharness/contracts (OpenAPI 3.1 + MSW 3.0 + TanStack Query 钩子)
   │
   └──▶ apps/showcase (axe-core WCAG 2.2 AA 刚性扫描与 Playwright 视觉回归门禁)
```

### 核心特性

- **单一事实来源 (Intent SSOT)**：以 `DESIGN.md` 为核心，自动推导全色阶与 W3C DTCG 2025.10 规范文件；禁止人工直接修改派生文件，构建脚本会自动比对阻断。
- **多端 Token 分发**：原生支持 Web（CSS 变量、Tailwind v4 主题）、预处理器（SCSS 变量及映射表）、Android（Jetpack Compose `Color.kt`）及 iOS（SwiftUI `ColorAsset.swift`）。
- **原生直连 Zag.js 状态机**：无头 Primitives 层直接绑定 Zag.js 1.46 有限状态机，杜绝多层包装损耗，原生达成 WAI-ARIA APG 无障碍键盘与交互行为。
- **契约驱动组件交互**：OpenAPI 3.1 规格驱动，自动化生成 MSW 3.0 Mock Handlers 与开箱即用的类型安全 TanStack Query 钩子（`useDataTableQuery`、`useComboboxSearchQuery`）。
- **AI Agent 工具支持**：内置 MCP (Model Context Protocol) 服务端，支持 AI 助手即时检索组件元数据与 Token 配置。

### 快速开始

```bash
# 环境要求：Node.js ^22.13 || ^24, pnpm 9.15.9
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

## 开源协议

[Apache-2.0](./LICENSE) © DuaneChen520
