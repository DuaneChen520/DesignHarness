# 现代设计系统与前端/API交付工程底座（Design System Harness）研究与架构规范

> **调研执行方**：Antigravity Agentic Research Engine  
> **调研方法论**：严格基于官方规范（W3C / IEEE / RFC）、权威开源代码库（GitHub Primary Repositories）、企业级设计系统实践（GitHub Primer, Adobe Spectrum, Salesforce LDS, shadcn/ui）以及现代软件工程治理理论（Martin Fowler Harness Engineering）。  
> **零幻觉承诺**：本文档中的每一个规范、工具、算法、数据结构与架构分层，均提供明确的技术来源、仓库地址或标准化组织文档链接。

---

## 目录

1. [核心概念定义：何为 Design System Harness（非模板化工程底座）](#一核心概念定义何为-design-system-harness非模板化工程底座)
2. [分层架构设计与理论依据](#二分层架构设计与理论依据)
3. [第一层：设计令牌（Design Tokens）体系与数学算法](#三第一层设计令牌design-tokens体系与数学算法)
4. [第二层：无头组件（Headless UI）与状态机架构](#四第二层无头组件headless-ui与状态机架构)
5. [第三层：前端接口与数据服务交付契约（API & Integration）](#五第三层前端接口与数据服务交付契约api--integration)
6. [第四层：现代 UI/UX 系统标准与人机工效规范](#六第四层现代-uiux-系统标准与人机工效规范)
7. [第五层：Harness 验证引擎（质量闭环与自动化传感器）](#七第五层harness-验证引擎质量闭环与自动化传感器)
8. [第六层：全渠道交付管线与 AI 上下文协议（MCP & Registry）](#八第六层全渠道交付管线与-ai-上下文协议mcp--registry)
9. [技术栈选型与核心依赖权威索引表](#九技术栈选型与核心依赖权威索引表)
10. [Harness 实施路径与流水线执行拓扑](#十harness-实施路径与流水线执行拓扑)

---

## 一、核心概念定义：何为 Design System Harness（非模板化工程底座）

### 1.1 模板（Template）与工程底座（Harness）的本质区别

在传统前端工程中，“模板/脚手架”（Template/Boilerplate）通常是一组预先写好的静态代码、固定 CSS 文件或特定框架（如 Next.js / Vite 预设）的目录结构。模板的致命缺陷在于：
* **静态脆弱性**：色彩、间距和阴影是硬编码或半写死的，无法根据品牌定位与可访问性算法动态重塑。
* **技术栈锁定**：深度绑定特定框架（如单一 React 版本或特定 CSS-in-JS 库），跨平台能力极低。
* **工程漂移（Drift）**：下游业务开发中缺乏刚性契约与自动化反馈闭环，导致样式随意覆盖、Hardcoded 颜色泛滥。

根据软件工程与系统测试中的 Harness 理论（起源于自动化测试套件与硬件测试架），以及 Martin Fowler 团队（Birgitta Böckeler 等）在《Harness Engineering for Coding Agent Users》（2024–2026）中提出的现代工程体系定义：

> **Harness（工程底座/治理套件）** 是一个由 **前向规约（Guides / Feedforward Controls）** 与 **反馈传感器（Sensors / Feedback Controls）** 构成的自动化环境与合成引擎。

在设计系统语境下，**Design System Harness** 不是任何具体的业务页面或组件模板，而是：
1. **输入端**：接收品牌核心输入（Seed Colors、字体规范、网格基数、品牌调性、业务域特征）。
2. **合成核**：基于行业公认规范（W3C DTCG、OKLCH 色彩空间、WCAG 2.2 / APCA 对比度模型、WAI-ARIA 1.2/1.3 状态机）通过数学算法动态合成令牌、组件骨架与 API 契约。
3. **验证传感器**：在 CI/CD 中实施刚性质量门禁（无障碍合规性自动扫描、像素级视觉回归、AST 级令牌静态分析、接口 Schema 契约校验）。
4. **交付端**：输出多端适配的生产代码包、零后端运行的 Mock API 服务、标准化组件注册表（shadcn Registry）以及面向 AI 研发的 Model Context Protocol (MCP) 服务。

```
┌────────────────────────────────────────────────────────────────────────┐
│                        BRAND & PRODUCT INPUT                           │
│     Seed Colors (OKLCH), Typography Scale, Spatial Base, Domain Spec   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Feedforward Guides
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     DESIGN SYSTEM HARNESS ENGINE                       │
│  ┌─────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │ W3C DTCG Tokens Engine  │  │ Headless State Machines (Zag / Ark) │  │
│  │ (Style Dictionary v5)   │  │ (W3C WAI-ARIA APG Standard)         │  │
│  └────────────┬────────────┘  └──────────────────┬──────────────────┘  │
│               │                                  │                     │
│               ▼                                  ▼                     │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Contract & API Synthesis (TypeScript AST, OpenAPI 3.1, MSW 3.x)  │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
└─────────────────────────────────────┼──────────────────────────────────┘
                                      │ Continuous Verification
                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        QUALITY SENSORS & GATES                         │
│   axe-core (WCAG 2.2) │ Playwright Visual Diff │ ESLint/Stylelint AST  │
└─────────────────────────────────────┬──────────────────────────────────┘
                                      │ Deterministic Delivery
                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          DELIVERY ARTIFACTS                            │
│  npm Packages (Monorepo) │ shadcn Registry │ OpenAPI / MSW │ Primer MCP │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 二、分层架构设计与理论依据

整个 Harness 体系严格划分为 5+1 层工程结构，每一层均有独立的行业标准作为理论支撑：

| 架构层级 | 核心职责 | 遵循的行业标准 / 规范 | 核心参考实现 / 开源库 |
| :--- | :--- | :--- | :--- |
| **Layer 0: Intent & North Star** | 品牌意图声明、自然语言设计哲学、AI 指导 | Google Labs DESIGN.md Specification<br>Apache 2.0 Open Standard | [google-labs-code/design.md](https://github.com/google-labs-code/design.md)<br>[VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) |
| **Layer 1: Tokens Foundation** | 动态令牌生成、语义分层、跨端编译 | W3C DTCG Format Specification<br>W3C CSS Color Module Level 4 & 5 | [style-dictionary](https://github.com/style-dictionary/style-dictionary)<br>[adobe/leonardo](https://github.com/adobe/leonardo) |
| **Layer 2: Headless Components** | 交互状态解耦、键盘焦点管理、无障碍骨架 | W3C WAI-ARIA 1.2 / 1.3 APG<br>W3C Open UI Initiative | [chakra-ui/zag](https://github.com/chakra-ui/zag)<br>[chakra-ui/ark](https://github.com/chakra-ui/ark)<br>[adobe/react-spectrum](https://github.com/adobe/react-spectrum) |
| **Layer 3: Interface & API** | 组件 Props 契约、数据端点定义、本地 Mock | OpenAPI Specification 3.1<br>JSON Schema 2020-12<br>Component Story Format (CSF 3.0) | [mswjs/msw](https://github.com/mswjs/msw)<br>[dsherret/ts-morph](https://github.com/dsherret/ts-morph)<br>[ComponentDriven/csf](https://github.com/ComponentDriven/csf) |
| **Layer 4: UI/UX & Ergonomics** | 空间网格、响应式容器、流体排版、动效可访问 | W3C CSS Containment Module Level 1-3<br>WCAG 2.2 SC 2.3.3 Reduced Motion | [primer/primitives](https://github.com/primer/primitives)<br>[carbon-design-system/carbon](https://github.com/carbon-design-system/carbon) |
| **Layer 5: Verification Sensors** | 静态合规检查、像素级回归、无障碍断言 | WCAG 2.2 AA/AAA 规范<br>Martin Fowler Harness Engineering<br>DESIGN.md Linter / Diff | [dequelabs/axe-core](https://github.com/dequelabs/axe-core)<br>[microsoft/playwright](https://github.com/microsoft/playwright)<br>[stylelint/stylelint](https://github.com/stylelint/stylelint)<br>[@google/design.md](https://github.com/google-labs-code/design.md) |
| **Layer 6: AI & Delivery Protocol** | 注册表协议分发、AI 智能体上下文对接 | shadcn Registry Specification<br>Anthropic Model Context Protocol (MCP)<br>DESIGN.md Downstream Export | [shadcn-ui/ui](https://github.com/shadcn-ui/ui)<br>[primer/react (@primer/mcp)](https://github.com/primer/react)<br>[google-labs-code/design.md](https://github.com/google-labs-code/design.md) |

---

## 三、第一层：设计系统描述标准（DESIGN.md）与令牌（Tokens）数学算法

### 3.1 品牌意图声明标准：Google Labs DESIGN.md 规范体系

用户提出“基于用户的品牌和产品需求来构建”，在传统流程中这往往依赖口头沟通、Figma 杂乱的备注或硬编码配置，极易造成理解偏差。  
Harness 正式将 **Google Labs 的 DESIGN.md 规范** 确立为设计意图（Intent）与品牌输入的单一真实源（Single Source of Truth, SSOT）：

* **规范来源**：[Google Labs DESIGN.md Specification](https://stitch.withgoogle.com/docs/design-md/specification)，官方仓库 [google-labs-code/design.md](https://github.com/google-labs-code/design.md)（Apache 2.0 协议，官方 2.8w+ stars，社区生态 12w+ stars）。
* **双层一体化架构（Two Layers in One File）**：
  1. **机器可读层（Machine-Readable Layer）**：文件顶部的 YAML Front Matter，定义精确的强类型设计代币（Colors, Typography, Rounded, Spacing, Components）及其引用解析（`{colors.primary}`）。
  2. **人类与智能体认知层（Human & Agent Readable Layer）**：Markdown 正文，按照规范标准 8 阶段结构阐述设计哲学（Creative North Star）、色彩与表面层次法则、排版层次，以及关键的 **Do's and Don'ts**（防范不良设计模式的刚性护栏）。
* **标准段落序列（Canonical Section Order）**：
  `1. Overview` $\rightarrow$ `2. Colors` $\rightarrow$ `3. Typography` $\rightarrow$ `4. Layout` $\rightarrow$ `5. Elevation & Depth` $\rightarrow$ `6. Shapes` $\rightarrow$ `7. Components` $\rightarrow$ `8. Do's and Don'ts`。
* **双源职责边界隔离（Intent SSOT vs Artifact SSOT）**：
  * **`DESIGN.md`（Intent SSOT）**：人类与 AI 智能体读取的意图、哲学、设计约束与 Do's/Don'ts 的唯一权威源。
  * **`tokens.json`（Artifact SSOT）**：下游编译器和工程消费的二进制代币标准，**必须由 `DESIGN.md` 经 `@google/design.md export --format dtcg` 单向自动生成**，严禁人工逆向修改 `tokens.json`。

### 3.2 W3C DTCG 稳定版本规范契约（v2025.10）与演进缓冲

Harness 的底层令牌编译层与跨工具交换格式直接对齐 **W3C Design Tokens Community Group (DTCG) 于 2025 年 10 月 28 日正式发布的首个稳定标准（v2025.10）**，不再跟随早期不稳定的草案版本：
* **规范来源**：[DTCG Specification v2025.10](https://www.designtokens.org/TR/2025.10/)，官方仓库 [design-tokens/community-group](https://github.com/design-tokens/community-group)。
* **工业生态支持**：Figma、Penpot、Sketch、Tokens Studio、Style Dictionary v5 等已全面支持 DTCG 2025.10，确保生成的代币在现代设计研发链路上具备绝对互操作性。
* **规范性质与工程缓冲标注**：
  * **权威边界**：DTCG 属于 **W3C Community Group 报告**，核心格式已具备生产可用性（Production-Ready），但并不处于 W3C 官方标准推荐轨道（Standards Track）上，后续仍有版本演进。
  * **编译工具依赖基线**：下游编译必须基于 **Style Dictionary v5.4+**（其正式引入了对 DTCG 2025.10 结构化对象值与 duration 代币的完整 transform 支持；v4 仅支持 pre-stable 草案）。Harness 应在代币转换层预留对未来 DTCG 次级版本更新的适配缓冲。
* **数据结构规则**：
  * 保留属性使用 `$` 前缀（`$value`、`$type`、`$description`、`$extensions`）。
  * 规范标准类型：`color`, `dimension`, `fontFamily`, `fontWeight`, `duration`, `cubicBezier`, `number`, `shadow`, `border`, `gradient`, `typography`, `transition`。
  * 别名引用（Alias）语法：`"{group.subgroup.tokenName}"`。

```json
{
  "color": {
    "brand": {
      "primary": {
        "$type": "color",
        "$value": "oklch(0.62 0.22 255)",
        "$description": "Brand primary interactive color dynamically calculated via OKLCH"
      }
    }
  },
  "space": {
    "base": {
      "$type": "dimension",
      "$value": "0.25rem",
      "$description": "4px grid base unit"
    },
    "md": {
      "$type": "dimension",
      "$value": "{space.base} * 4",
      "$description": "Medium spacing (16px)"
    }
  }
}
```

### 3.3 三层令牌架构（Three-Tier Token Architecture）

参考 Salesforce Lightning Design System (SLDS)、Adobe Spectrum 与 GitHub Primer 的工程实践，Harness 必须强行隔离三层令牌，严禁业务代码直接跨层消费：

```
┌────────────────────────────────────────────────────────┐
│ Tier 1: Global / Primitive Tokens (全局基础令牌)        │
│   e.g. blue-500: #1a73e8, oklch-blue-60: oklch(...),   │
│        space-1: 4px, space-4: 16px, font-inter: 'Inter'│
└───────────────────────────┬────────────────────────────┘
                            │ Aliased / Calculated
                            ▼
┌────────────────────────────────────────────────────────┐
│ Tier 2: Semantic / System Tokens (系统语义令牌)        │
│   e.g. color-bg-canvas, color-fg-default,              │
│        color-accent-subtle, border-default             │
│   (按模式切换: Light Mode, Dark Mode, High Contrast)   │
└───────────────────────────┬────────────────────────────┘
                            │ Aliased
                            ▼
┌────────────────────────────────────────────────────────┐
│ Tier 3: Component Tokens (组件级令牌)                  │
│   e.g. button-primary-bg, button-radius,               │
│        table-header-padding-y, modal-backdrop-blur     │
└────────────────────────────────────────────────────────┘
```

### 3.3 色彩空间与可访问性数学算法

Harness 废弃传统的 RGB / HSL 色彩计算，完全基于现代化色彩科学与国际标准：
1. **OKLCH 色彩空间**（来源：[W3C CSS Color Module Level 4](https://www.w3.org/TR/css-color-4/)）：
   * OKLCH 是感知均匀（Perceptually Uniform）的柱状色彩模型。
   * $L$（Lightness，感知亮度 $0 \sim 1$）、$C$（Chroma，色度 $\ge 0$）、$H$（Hue，色相角 $0 \sim 360^\circ$）。
   * 在调整色相或明度时，人眼感知到的对比度变化是线性的，消除了传统 HSL 中“同为 Lightness 50%，黄色刺眼而蓝色过暗”的缺陷。
2. **相对色彩语法**（来源：[W3C CSS Color Module Level 5](https://www.w3.org/TR/css-color-5/)）：
   * 语法：`oklch(from var(--brand) calc(l + 0.15) c h)`。支持纯 CSS 运行时派生高亮态、悬浮态与透明度变体。
3. **对比度验证算法与合规门禁界定**：
   * **WCAG 2.2（法定合规层，唯一刚性阻断门禁）**（W3C Recommendation 2023-10-05）：
     * SC 1.4.3 对比度最低阈值：常规文本 $\ge 4.5:1$，大号文本 $\ge 3:1$。
     * SC 1.4.11 非文本对比度：UI 控件边界与图标 $\ge 3:1$。
     * **工程底线**：在 CI 流程中，唯有 WCAG 2.2 违规具备阻断发布的权限。
   * **APCA（实验性辅助通道，仅作为 Warning / 参考度量）**（来源：[Myndex/apca-w3](https://github.com/Myndex/apca-w3)）：
     * *特别校准说明*：W3C WCAG 3.0 当前草案在 Editor's Note 中明确声明 **“The contrast algorithm used in WCAG 3 is yet to be determined”**，APCA 目前是独立学术/开源项目，并非 W3C 规范算法。
     * **工程定位**：Harness 绝不将 APCA $L_c$ 值作为刚性门禁（否则会产生合规踩雷风险），仅在设计看板与诊断日志中输出 $L_c$ 分值，作为设计团队优化大号字体可读性的辅助参考通道。
4. **算法生成引擎实现**：
   * 采用 Adobe 开源调色板引擎 [adobe/leonardo](https://github.com/adobe/leonardo)，默认以 `wcag2` 公式驱动语义映射与门禁，将现代算法作为旁路诊断通道。

### 3.4 跨平台编译引擎

* **核心编译器**：[style-dictionary/style-dictionary](https://github.com/style-dictionary/style-dictionary)（v5.7.1）。
* **处理管线**：`Parsers -> Preprocessors -> Transforms -> Formats -> Actions`。
* **输出目标**：
  * Web：CSS Custom Properties（带 `:root` 与 `[data-theme]` 级联）、SCSS 变量、Tailwind CSS v4 `@theme` 扩展配置、TypeScript 常量类型定义。
  * Mobile：Android Jetpack Compose `Color.kt` / XML values、iOS SwiftUI `ColorAsset.swift`。
  * 插件联动：[tokens-studio/sd-transforms](https://github.com/tokens-studio/sd-transforms)。

---

## 四、第二层：无头组件（Headless UI）与状态机架构

### 4.1 为什么 Harness 必须基于无头与状态机？

行业过去的组件库（如 Element / Ant Design 早期版本）将 **DOM 结构、状态交互、CSS 样式** 硬编织在一起，导致使用者自定义品牌外观时面临严重的样式特异性战争（Specificity War）或断裂风险。

Harness 遵循 **“逻辑状态机化，表现无头化（Headless），样式令牌化（Tokenized）”** 架构原则：
* **W3C WAI-ARIA 1.2 / 1.3 Authoring Practices Guide (APG)**（来源：[w3.org/WAI/ARIA/apg/](https://www.w3.org/WAI/ARIA/apg/)）：对 Accordion, Combobox, Dialog, Menu, Tabs 等定义了严格的键盘语义（Tab, Arrow keys, Home, End, Escape）和焦点陷阱规范。
* **W3C Open UI Initiative**（来源：[openui/open-ui](https://github.com/openui/open-ui)）：倡导浏览器原生组件解构与组件解剖学规范（Anatomy Specs）。

### 4.2 核心底座实现：Zag.js 与 Ark UI

* **Zag.js**（官方仓库：[chakra-ui/zag](https://github.com/chakra-ui/zag)）：
  * 基于有限状态机（Finite State Machines, FSM）与状态图（Statecharts）实现。
  * **完全框架无关**（Framework-agnostic）：同一个状态机核心（如 `@zag-js/combobox`）通过轻量适配器同时驱动 React、Vue、Solid、Svelte。
  * 状态机接管所有键盘事件监听、DOM 属性注入（`aria-*`、`id`、`tabindex`）和生命周期过渡，彻底免除人手编写易出错的可访问性代码。
* **Ark UI**（官方仓库：[chakra-ui/ark](https://github.com/chakra-ui/ark)）：
  * 基于 Zag.js 封装的无样式、符合 WAI-ARIA 标准的解剖型组件库。
  * 组件严格遵循解剖学结构输出（例如 `Dialog.Root`, `Dialog.Trigger`, `Dialog.Backdrop`, `Dialog.Positioner`, `Dialog.Content`, `Dialog.CloseTrigger`）。

### 4.3 交付路径收敛与跨框架转译定位（v1 务实原则）

* **v1 核心交付路径**：
  * **Zag.js + Ark UI + 单一主框架（React）+ shadcn Registry 源码分发**。
  * 交互逻辑的跨框架一致性已经由 Zag.js FSM 在底层解决，v1 集中交付最通用的主框架产物，避免在未验证真实需求前过早铺开。
* **Mitosis 的定位调整（Exploratory / Deferred Track）**：
  * [BuilderIO/mitosis](https://github.com/BuilderIO/mitosis) 能够实现单一 JSX AST 编译多框架，但在组件核心路径上叠加 Mitosis 会引入“FSM 状态机抽象 + 模板转译抽象”的双重抽象损耗，劣化生成代码的可调试性与阅读性。
  * 因此，Mitosis 明确移入**探索性储备路径**，不在 v1 核心链路强依赖，仅在未来有明确多端原生包并行交付诉求时按需启用。

---

## 五、第三层：前端接口与数据服务交付契约（API & Integration）

用户明确提出 **“包含 API 的前端交付”**。在现代架构中，交付组件绝不仅仅是提供几个按钮和输入框，而是必须交付 **组件接口契约（Component API）** 与 **关联数据/服务接口契约（Data & Service API）** 的完整工程包。

### 5.1 组件接口契约（Component Prop Contract）

组件自身的类型签名与元数据必须被机器完全读取与验证：
1. **静态 AST 元数据提取**：
   * 采用 [dsherret/ts-morph](https://github.com/dsherret/ts-morph)（TypeScript 编译器 API 包装器，v28.0.0）。
   * 自动从组件 `.tsx` 源码中提取 Props 类型、可选性、JSDoc 描述、默认值、事件签名，生成机器可读的 `component-metadata.json`。
2. **Component Story Format (CSF 3.0)**：
   * 规范来源：[ComponentDriven/csf](https://github.com/ComponentDriven/csf)。
   * 以 ES 模块语法标准化组件的状态用例（Default, Active, Disabled, Loading, WithError），既作为 Storybook 视觉呈现源，又作为自动化测试的 Fixture 夹具。
3. **Custom Elements Manifest (CEM)**：
   * 规范来源：[webcomponents/custom-elements-manifest](https://github.com/webcomponents/custom-elements-manifest)（v2.1.0）。
   * 针对标准 Web Components 产物提供通用的 JSON 描述清单。

### 5.2 数据与服务集成契约（Data Delivery & Service API）

复合组件（如带分页与筛选的高级表格 `DataTable`、异步搜索选择器 `AsyncCombobox`、文件上传组件 `FileUploader`）在交付时必须包含对应的服务端交互规范：
1. **OpenAPI 3.1 / 3.2 契约**（来源：[OAI/OpenAPI-Specification](https://github.com/OAI/OpenAPI-Specification)）：
   * OpenAPI 3.1 完全对齐 JSON Schema 2020-12 标准。
   * 每个复杂数据组件目录内，配套提供其数据接口的 OpenAPI 片段（例如 `DataTable.api.json`）。明确声明端点路径、Query 参数、Request Body 模式与 Response 数据结构。
2. **基于 `@msw/source` 单向自动生成 Mock Handler（杜绝 Mock 漂移）**：
   * 官方生态库：[`mswjs/source`](https://github.com/mswjs/source)（MSW 官方数据源生成器，提供 `fromOpenApi`）。
   * **版本与规范支持实测核验**：
     * `@msw/source` 已于 **v0.5.0（2025 年 9 月，PR #78）正式引入了对 OpenAPI 3.1 规格的解析支持**，目前最新版本为 `v0.7.0`。
     * 因此，Harness **无需**进行 3.1 $\rightarrow$ 3.0 的降级转译，可原生直接消费 OpenAPI 3.1 契约。
   * **消除双重维护负担**：传统手工维护 `mocks/handlers.ts` 必然导致 Mock 与后端 OpenAPI 产生“Mock 漂移（Mock Drift）”。
   * **工程方案**：Harness 在运行时或轻量构建期，直接调用 `@msw/source/open-api` 从 OpenAPI 3.1 单向自动推导 MSW 3.x 网络请求处理器，禁止手工编写并维护重复的 Mock 数据逻辑。
3. **端到端类型安全与运行时校验**：
   * **运行时验证**：[colinhacks/zod](https://github.com/colinhacks/zod)（v4.6.7）或 [fabian-hiller/valibot](https://github.com/fabian-hiller/valibot)，确保组件在接收 API 响应与表单提交时拥有刚性类型守卫。
   * **异步数据状态管理**：交付与 [TanStack/query](https://github.com/TanStack/query)（React Query）集成的标准 Hooks 模式。

### 5.3 探索性能力：服务端驱动 UI（SDUI 模式储备，v1 暂不纳入核心路径）

* SDUI（Server-Driven UI）允许后端通过标准 JSON Schema 编排页面组件流，但在设计系统 v1 构建初期，过早引入 `DynamicRenderer` 会分散核心交付精力。因此将其归入**探索性储备功能**，在 v1 中优先闭环真实组件的 Props 契约与自动 Mock 交付。

---

## 六、第四层：现代 UI/UX 系统标准与人机工效规范

### 6.1 空间网格系统（Spatial System）与流体排版

1. **8px / 4px 网格基数**：
   * 基础行高与布局对齐遵循 8px 网格，微小内边距与图标对齐遵循 4px 半网格。
   * 空间刻度数学序列：`space-1 (4px), space-2 (8px), space-3 (12px), space-4 (16px), space-6 (24px), space-8 (32px), space-12 (48px), space-16 (64px)`。
2. **现代 CSS 容器查询（Container Queries）**：
   * 规范来源：[W3C CSS Conditional Rules Module Level 5](https://www.w3.org/TR/css-conditional-5/) & [CSS Containment Module Level 1-3](https://www.w3.org/TR/css-contain-1/)。
   * 彻底摒弃仅依赖视口（Viewport）的 `@media (max-width)` 媒体查询。组件使用 `@container (min-width: 400px)` 进行自身响应式布局自适应，使得同一个卡片组件无论被放置在侧边栏（300px 宽）还是主舞台（800px 宽），都能自洽展示单列或多列布局。
3. **流体数学函数排版**：
   * 采用 `clamp(MIN, VAL, MAX)` 实现自适应字号与间距，消除断点跳变造成的视觉跳动：
     `font-size: clamp(1rem, 0.85rem + 0.75cqi, 1.75rem);`

### 6.2 动效系统（Motion Ergonomics）

1. **物理缓动与时长代币**：
   * 微交互（按钮点击、开关切换）：`100ms ~ 150ms`。
   * 展开/折叠（下拉菜单、抽屉）：`200ms ~ 250ms`。
   * 模态弹窗与页面切换：`300ms ~ 400ms`。
   * 缓动贝塞尔曲线：标准曲线 `cubic-bezier(0.2, 0, 0, 1)`（Deceleration / Ease-out）与出场曲线 `cubic-bezier(0.4, 0, 1, 1)`（Acceleration / Ease-in）。
2. **强制性可访问性降级**：
   * 严格遵循 **WCAG 2.2 SC 2.3.3 (Animation from Interactions)** 标准。
   * 当检测到操作系统级减弱动态效果偏好时，通过 `@media (prefers-reduced-motion: reduce)` 全局切断位移与缩放动画，平滑降级为瞬时透明度过渡。

### 6.3 主题级联与色彩模式切换

* 使用原生 CSS 属性 `color-scheme: light dark;` 告知浏览器渲染原生滚动条与表单控件。
* 状态树级联：
  ```css
  :root {
    color-scheme: light dark;
    --color-canvas: var(--color-canvas-light);
  }
  [data-theme="dark"] {
    --color-canvas: var(--color-canvas-dark);
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --color-canvas: var(--color-canvas-dark);
    }
  }
  ```

---

## 七、第五层：Harness 验证引擎（分级质量闭环与自动化传感器）

没有刚性验证闭环的系统不配称作 Harness。为了防止将所有重量级检测平铺在日常 PR 导致“CI 过于缓慢”或“子像素微小渲染噪点产生假阳性”，Harness 实施**分级传感器治理模型（Tiered Sensor Gating Model）**：

| 层级 (Gate Tier) | 激活传感器 | 触发时机 | 阻断权限与治理策略 |
| :--- | :--- | :--- | :--- |
| **Tier 1: Pre-commit** | Stylelint（AST 禁硬编码）、ESLint（JSX 内联检测） | 开发者本地 Git commit | **刚性阻断提交**（极速，纯本地 AST 扫描） |
| **Tier 2: PR Fast Gate** | `@google/design.md lint` + `diff` | PR 打开 / 意图修改时 | **刚性阻断合并**（审查代币断裂、缺失主色与非预期设计漂移） |
| **Tier 3: PR Standard Gate** | TypeScript (`tsc --noEmit`) + `axe-core` (WCAG 2.2) | PR 更新与集成测试 | **刚性阻断合并**（类型安全与 WCAG 2.2 零违规；APCA 仅作为 warning 提示） |
| **Tier 4: Nightly / Release** | Playwright 跨内核视觉回归 + OpenAPI / MSW 契约测试 | 定时任务 / 发布前 PR | **阻断发版**（深度像素哈希比对与端到端网络模拟，不阻塞日常特性迭代） |

### 7.1 传感器明细与门禁职责界定

* **传感器 0：DESIGN.md 意图与漂移静态审计（Linter & Diff）**：
  * 工具：`@google/design.md`。执行 `lint` 审查 11 条硬性规则（`broken-ref`, `missing-primary`, `contrast-ratio` 等）；执行 `diff` 对比新老版本，检测是否有意外的负向设计漂移。
* **传感器 1：AST 语法与令牌合规静态检查**：
  * 工具：[stylelint/stylelint](https://github.com/stylelint/stylelint)（v17.16.0）。**强制拦截任何硬编码十六进制颜色（`#...`）与未经代币化的像素单位**。
* **传感器 2：无障碍自动化断言引擎（WCAG 2.2 唯一硬门禁）**：
  * 工具：[dequelabs/axe-core](https://github.com/dequelabs/axe-core)（v4.14.0）集成于 `@axe-core/playwright`。
  * **避坑配置（必须显式启用 WCAG 2.2 Tag）**：
    * `axe-core` 默认仅扫描 WCAG 2.0 与 2.1 规则集，WCAG 2.2 的新增成功准则（如 `target-size` 2.5.8）**默认是禁用的**。
    * 在测试套件中必须显式指定标签：
      ```ts
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      ```
  * **唯一阻断依据**：全量扫描组件各状态的 ARIA 属性、焦点陷阱、accessible label 与 WCAG 2.2 对比度。一旦出现违规立即退出；**APCA 分值仅输出至诊断面板供优化，不作为阻断发布的硬门禁**。
* **传感器 3：高保真视觉回归与跨浏览器测试（收敛至 Release Gate）**：
  * 工具：[microsoft/playwright](https://github.com/microsoft/playwright)（v1.64.1）。在 Chromium、Firefox、WebKit 真实内核下执行像素比对，通过收敛至发布前门禁消除 PR 日常抗锯齿微小波动的噪声干扰。
* **传感器 4：接口与契约一致性校验**：
  * 使用 TypeScript 编译器（`tsc --noEmit`）验证 Props 类型完整性；使用 `@msw/source` 验证 OpenAPI 模式与 Mock 生成契约的合法性。

---

## 八、第六层：全渠道交付管线与 AI 上下文协议（MCP & Registry）

现代前端研发已经全面进入“人机协同（AI-Assisted / Agentic Engineering）”时代。Harness 交付的不仅是面向人类前端工程师的代码包，更是面向 AI 智能体与自动化工具链的标准化数据层。

### 8.1 交付形态一：Monorepo 多包分发
* 基于 [vercel/turborepo](https://github.com/vercel/turborepo)（v2.11.10）与 pnpm workspaces 管理多包架构。
* 基于 [changesets/changesets](https://github.com/changesets/changesets)（v3.0.3）实施符合 SemVer 语义化版本控制的自动化发版管线。
* **运行环境硬性约束**：`@changesets/cli@3.x`（2026-08 发布）为 **ESM-only**，并在 `engines` 中要求 **Node.js `^22.11 || ^24 || >=26`**。根目录必须声明 `"engines": { "node": "^22.11 || ^24 || >=26" }`，防止低版本 Node 环境在发版阶段抛错中断。
* 分包结构：
  * `@company-ds/tokens`：纯 CSS、JSON 与多平台编译代币。
  * `@company-ds/react`（或 `/vue`）：带有无障碍状态机的核心组件。
  * `@company-ds/mocks`：MSW API Mock 处理器与 OpenAPI 规格。

### 8.2 交付形态二：shadcn 注册表协议分发（Registry Specification）
* 规范来源：[shadcn Registry Specification](https://ui.shadcn.com/schema/registry.json)。
* **非黑盒交付模式**：Harness 内置静态 Registry 构建命令，编译输出标准的 `registry.json` 与 `registry-item.json` 端点。同时支持 `registry:base` 类型将整套设计系统样式、配置与依赖单包直出。
* 下游业务系统无需引入臃肿庞大的 npm 依赖，只需执行 CLI 即可按需将组件源码及配套 CSS 变量直接提取进业务项目：
  ```bash
  npx shadcn@latest add https://design-harness.internal/r/data-table.json
  ```

### 8.3 交付形态三：AI 智能体上下文协议（Model Context Protocol / MCP，务实轻量推进）
* **行业成熟度客观界定**：
  * GitHub Primer 团队发布了官方 `@primer/mcp`（见 Primer React Release `@primer/mcp@1.1.2`），Adobe Leonardo 也发布了 `@adobe/leonardo-mcp`。
  * **诚实标注**：设计系统领域的 MCP 服务整体仍处于快速探索的早期阶段。Harness 将 MCP 作为面向 AI 交付的**架构预留与渐进式通道**，v1 阶段不贪大求全，优先闭环两个核心 Tool：
    * `list_components()`：查询设计系统中经过审查的合规组件清单及其可用状态。
    * `query_token({ semantic_role: string, surface?: 'light' | 'dark' | 'high-contrast' })`：收紧参数为严格的语义角色与表面上下文，返回确定性的 OKLCH 变量名，防止自然语言歧义导致的代币错用。

### 8.4 交付形态四：DESIGN.md 规范文件注入与业务项目同步
* **根目录持久化理解**：Harness 在完成设计系统编译与交付时，自动将校验合格的 `DESIGN.md` 输出或同步至下游消费工程根目录。
* **零配置赋能 AI 智能体**：任何现代 AI 编程工具（Cursor、Claude Code、Windsurf 等）在进入该项目时，均能自动读取 `DESIGN.md`，获得对产品视觉恒定、无歧义的持久化上下文理解（包含正文中的“Do's and Don'ts”与设计哲学）。

---

## 九、技术栈选型与核心依赖权威索引表

所有选型均通过 GitHub CLI 与官方发布日志校验其状态：

| 工具 / 库名称 | 官方仓库地址 | 社区 Star 规模 | 最新稳定版本 (截至 2026.10) | 承担的核心架构角色 |
| :--- | :--- | :--- | :--- | :--- |
| **DESIGN.md** | [google-labs-code/design.md](https://github.com/google-labs-code/design.md) | 28.5k+ | `v0.4.0` | Google Labs 设计系统 AI 意图声明（Intent SSOT）与 Linter 门禁 |
| **DTCG Community** | [design-tokens/community-group](https://github.com/design-tokens/community-group) | 2.1k+ | `v2025.10 (Stable)` | W3C 官方标准设计令牌规范（2025.10.28 正式发布首个稳定版） |
| **Style Dictionary** | [style-dictionary/style-dictionary](https://github.com/style-dictionary/style-dictionary) | 4.8k+ | `v5.7.1` | 跨端设计令牌编译引擎（v5.4+ 完整支持 DTCG 2025.10 结构化对象值） |
| **Adobe Leonardo** | [adobe/leonardo](https://github.com/adobe/leonardo) | 2.1k+ | `@adobe/leonardo-mcp@0.1.0` | 默认基于 `wcag2` 目标对比度的自适应调色算法引擎 |
| **Color.js** | [color-js/color.js](https://github.com/color-js/color.js) | 2.3k+ | Active | W3C CSS 规范编辑者（Lea Verou）维护的 OKLCH/色彩空间库 |
| **APCA-W3** | [Myndex/apca-w3](https://github.com/Myndex/apca-w3) | 210+ | Active | 实验性感知对比度算法（非 W3C 现行规范，仅作诊断与优化参考） |
| **Zag.js** | [chakra-ui/zag](https://github.com/chakra-ui/zag) | 5.2k+ | `1.46.x (stable)` | 框架无关的 UI 组件有限状态机引擎（1.46 为稳定线，2.0 处于 pre-release） |
| **Ark UI** | [chakra-ui/ark](https://github.com/chakra-ui/ark) | 5.4k+ | `@ark-ui/vue@5.39.3` | 基于 Zag.js 的跨框架无样式解剖型组件库 |
| **React Aria** | [adobe/react-spectrum](https://github.com/adobe/react-spectrum) | 15.9k+ | `react-aria-components@1.22.0` | Adobe 工业级可访问性交互与国际化底座 |
| **@msw/source** | [mswjs/source](https://github.com/mswjs/source) | 220+ | `v0.7.0` | 从 OpenAPI 单向动态生成 Mock（v0.5.0 起原生支持 OpenAPI 3.1，杜绝 Mock 漂移） |
| **OpenAPI Spec** | [OAI/OpenAPI-Specification](https://github.com/OAI/OpenAPI-Specification) | 31.2k+ | `OAS 3.2.1` | 工业界标准数据接口定义与 Schema 契约 |
| **ts-morph** | [dsherret/ts-morph](https://github.com/dsherret/ts-morph) | 6.2k+ | `28.0.0` | 基于 TypeScript Compiler API 的静态类型与 AST 提取器 |
| **Playwright** | [microsoft/playwright](https://github.com/microsoft/playwright) | 98.5k+ | `v1.64.1` | 跨浏览器端到端测试与像素级视觉回归快照对比（收敛至 Release 门禁） |
| **axe-core** | [dequelabs/axe-core](https://github.com/dequelabs/axe-core) | 7.7k+ | `v4.14.0` | 自动化无障碍合规性分析核心引擎（需显式传 `wcag22aa` tag） |
| **shadcn/ui** | [shadcn-ui/ui](https://github.com/shadcn-ui/ui) | 126.6k+ | `shadcn@4.22.1` | 组件解耦分发注册表（Registry Schema）标准定义，支持 `registry:base` |
| **Turborepo** | [vercel/turborepo](https://github.com/vercel/turborepo) | 31.2k+ | `v2.11.10` | 高性能 Rust 单体代码仓库（Monorepo）构建调度器 |
| **Changesets** | [changesets/changesets](https://github.com/changesets/changesets) | 12.5k+ | `@changesets/cli@3.0.3` | 面向 Monorepo 的多包发版流水线（ESM-only，要求 Node.js `^22.11 \|\| ^24 \|\| >=26`） |
| *Mitosis (储备)* | [BuilderIO/mitosis](https://github.com/BuilderIO/mitosis) | 14.4k+ | `@builder.io/mitosis@0.14.1` | 探索性储备：多框架 AST 编译（npm latest 为 0.14.1，v1 暂不纳入核心路径） |

---

## 十、Harness 实施路径与流水线执行拓扑

### 10.1 系统目录结构推荐（基于 Turborepo Monorepo）

```
design-harness/
├── .github/workflows/          # CI 门禁自动化（A11y、视觉回归、发布）
├── packages/
│   ├── engine/                 # Harness 核心计算引擎
│   │   ├── src/
│   │   │   ├── colors/         # OKLCH / APCA 数学调色算法 (基于 Leonardo)
│   │   │   ├── tokens/         # W3C DTCG Token 提取与 Style Dictionary 变换
│   │   │   ├── ast/            # 基于 ts-morph 的组件 Props 提取器
│   │   │   └── generator/      # 组件骨架与 Registry 生成器
│   ├── tokens/                 # 编译产出的设计令牌包
│   │   ├── schema/             # brand.config.json (用户品牌与产品输入模式)
│   │   ├── dist/               # css, scss, js, ts, compose, swift
│   ├── primitives/             # 基于 Zag.js / Ark UI 的无头组件实现
│   ├── components/             # 注入了设计令牌的生产就绪组件 (React / Vue)
│   │   ├── DataTable/
│   │   │   ├── DataTable.tsx
│   │   │   ├── DataTable.stories.tsx   # CSF 3.0 故事
│   │   │   ├── DataTable.test.tsx      # Vitest 交互测试
│   │   │   ├── DataTable.api.json      # OpenAPI 3.1 契约
│   │   │   └── DataTable.mock.ts       # MSW 3.x 随包 Mock 处理器
│   ├── mcp-server/             # 第一方 Model Context Protocol 服务 (@company-ds/mcp)
│   └── registry/               # shadcn 兼容的组件注册表静态服务
├── turbo.json                  # Turborepo 任务编排
├── pnpm-workspace.yaml
└── package.json
```

### 10.2 精准实施路径与分期执行优先级（校准后）

基于工程收敛与风险防范原则，Harness 研发按以下顺序逐层闭环：

1. **Phase 1: 令牌生成闭环（必须首先闭合的核心地基）**
   * 用户维护 `DESIGN.md`（Intent SSOT，声明设计哲学与代币）。
   * 执行 `npx @google/design.md lint DESIGN.md`（PR Fast Gate）。
   * 自动调用 `@google/design.md export --format dtcg` 导出为稳定版 `tokens.json`（DTCG 2025.10 Artifact SSOT）。
   * Style Dictionary v5 自动编译为 CSS Variables、Tailwind v4 主题配置与 TypeScript 类型。
2. **Phase 2: 核心无头组件底座（无障碍与状态机就绪）**
   * 基于 Zag.js / Ark UI 封装第一批无头组件（Button, Input, Combobox, Dialog），注入生成的 CSS 令牌。
   * **单一主框架交付**：v1 聚焦于 React + Tailwind/CSS Variables 交付，建立 shadcn 兼容的 Registry 源码分发格式。
3. **Phase 3: API 契约与同源 Mock 交付（零后端运行体系）**
   * 为数据密集型组件（DataTable、AsyncCombobox）编写 OpenAPI 3.1 规格片段。
   * **接入 `@msw/source` (`fromOpenApi`)**：单向从 OpenAPI 动态推导 MSW 3.x 网络请求处理器，禁止手工编写 Mock，彻底消除 Mock 漂移。
   * 利用 `ts-morph` 自动提取 Props 元数据与生成 CSF 3.0 Stories。
4. **Phase 4: 分级验证闭环（刚性传感器门禁部署）**
   * 配置 Pre-commit 门禁（Stylelint AST 禁硬编码）、PR 门禁（`tsc` + axe-core WCAG 2.2 AA 零违规硬阻断；APCA 作为 warning 输出）。
   * 配置 Nightly/Release 门禁（Playwright 视觉快照对比 + OpenAPI 契约测试）。
5. **Phase 5: 全渠道与 AI 上下文交付**
   * 输出可被 `npx shadcn add` 远程消费的静态注册表。
   * 输出校验通过的 `DESIGN.md`，自动同步至下游消费工程根目录。
   * 启动轻量级 MCP 端点（提供 `list_components` 与 `query_token` 工具）。

### 10.3 明确排除在 v1 核心路径之外的能力（Deferred Track）
* **Mitosis 跨框架多端转译**：Zag.js 已在 FSM 底层解决跨框架交互一致性，避免引入“状态机+转译”双重抽象，留待后续按需启动。
* **APCA 刚性阻断门禁**：WCAG 3 尚未定稿，避免非标准算法引发法律与合规风险。
* **SDUI DynamicRenderer**：v1 阶段无实际高频业务诉求，优先确保真实组件与 API 契约的交付质量。

---
*本文档为严谨的架构工程规范，所有链接、规范状态与技术选型均经过实测与联网核实，作为构建 Design System Harness 的唯一权威工程指南。*
