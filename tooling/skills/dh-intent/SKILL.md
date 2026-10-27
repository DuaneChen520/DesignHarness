---
name: dh-intent
description: Conduct a structured brand intent and domain ergonomics interview (Stage 0: Intent Genesis), generate canonical DESIGN.md, ensure the DesignHarness Web Cockpit is running, and hand off via deep link.
---

# Stage 0: Intent Genesis (`dh-intent`)

This skill guides the developer through a structured interview to establish or refine a project's brand intent and ergonomics, formalizes it into a canonical `DESIGN.md` (Intent SSOT), verifies that the local DesignHarness Web Cockpit is ready, and outputs a handoff deep link.

## Trigger Phrases
- `/dh-intent`
- "初始化设计系统" / "初始化品牌规范" / "探讨设计系统"
- "使用 dh 探讨品牌需求"

---

## Workflow

### Step 1: Conduct the Structured Domain Interview
Never guess brand values or leave ergonomics unstated. Interview the user through the **Domain Question Bank**:

#### 1. Domain Preset
Ask the user to select the primary operating environment:
- **Cockpit Console (车机驾驶舱)**: Dark background, anti-glare, density 8/10, physical touch target $\ge 48\times 48\text{px}$, spacing $\ge 8\text{px}$ (AAOS / ISO 15008), offline self-hosted fonts, restrained motion.
- **Financial Operations (金融运营控制台)**: High density, tabular clarity, dual light/dark modes, APCA contrast validation, numeric legibility.
- **Consumer Web/Mobile (消费端全渠道)**: Fluid spacing, expressive variance, light/dark themes, broad typography hierarchy.

#### 2. Color System & Light Environment
- **Canvas / Surface**:
  - For Cockpit: Default to charcoal dark `#0B0D10` (never pure black `#000000` to prevent night glare and OLED smear).
  - For Financial: Default to clean neutral `#FAFAFB` (light) and `#0F1115` (dark).
- **Brand Primary / Signal Accent**:
  - Elicit the core brand seed color (e.g. CarWeb's `#5B8DBF` Instrument Blue).
- **Semantic Link / Status Colors**:
  - Elicit specific state colors (e.g. connected, degraded, reconnecting, failed).

#### 3. Ergonomics & Typography
- Touch target minimums (e.g. $48\times 48\text{px}$).
- Primary typography family (e.g. self-hosted `Alibaba PuHuiTi 3.0`, system sans-serif; never unverified web fonts in offline vehicle environments).

#### 4. Anti-Patterns (Do's & Don'ts)
Confirm hard prohibitions:
- Prohibit emojis in interface.
- Prohibit generic AI neon glow shadows and saturated blue/purple gradients.
- Prohibit `Inter` or serif fonts in dashboard interfaces.
- Prohibit overlapping content and unconstrained card grids.

---

### Step 2: Write Canonical `DESIGN.md`
Format the agreed parameters into `DESIGN.md` in the target project root. Follow the Google Labs specification with YAML frontmatter:

```markdown
---
version: alpha
name: <System Name>
description: <One-sentence domain description>
colors:
  canvas: "<hex>"
  surface: "<hex>"
  surface-sunken: "<hex>"
  surface-raised: "<hex>"
  primary: "<hex>"
  primary-hover: "<hex>"
  text-primary: "<hex>"
  text-secondary: "<hex>"
  border-subtle: "<hex>"
  success: "<hex>"
  warning: "<hex>"
  danger: "<hex>"
typography:
  display-lg:
    fontFamily: <font>
    fontSize: 2rem
---

# 设计系统：<System Name>

## 1. 视觉主题与氛围
...
## 2. 色彩系统与角色
...
## 3. 布局与人机工效
...
## 4. 反模式清单
...
```

---

### Step 3: Ensure Local Web Cockpit is Running
Check if `dh gui` (Showcase & Cockpit) is listening (default `http://localhost:8787`).
If not, start it in the background or instruct the environment.

---

### Step 4: Emit Handoff Deep Link
Provide the user with a clickable deep link to the Cockpit dashboard:

```markdown
✅ **品牌意图已就绪并写入 `DESIGN.md`！**

👉 **[点击打开 DesignHarness 工程驾驶舱](http://localhost:8787/dashboard?project=<absolute-project-path>)**

在驾驶舱中，你可以：
1. 实时预览与微调 OKLCH 色阶及 WCAG 2.2 AA / APCA 对比度评分；
2. 静态扫描业务代码，查看双维度重构进度（组件替换率与 Token 纯净度）；
3. 一键运行 Tier 1~3 质量门禁，并在确认无误后向业务工程投送标准组件。
```
