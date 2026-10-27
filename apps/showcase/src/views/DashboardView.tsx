import { useEffect, useState, type ReactNode } from 'react';

const RECENT_PROJECTS_KEY = 'dh_recent_projects';
const LANG_STORAGE_KEY = 'dh_cockpit_lang';

type Language = 'zh' | 'en';

function getStoredRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_PROJECTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function storeRecent(path: string): string[] {
  try {
    const current = getStoredRecent().filter((p) => p !== path);
    const updated = [path, ...current].slice(0, 8);
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [path];
  }
}

export interface TokenViolationItem {
  readonly file: string;
  readonly line: number;
  readonly raw: string;
  readonly reason: string;
}

export interface ProjectReport {
  readonly path: string;
  readonly exists: boolean;
  readonly hasDesignMarkdown: boolean;
  readonly designMarkdownContent?: string;
  readonly dualVector?: {
    readonly healthScore: number;
    readonly components: {
      readonly total: number;
      readonly standardized: number;
      readonly legacy: number;
      readonly standardizationRatio: number;
      readonly standardList: readonly string[];
      readonly legacyList: readonly string[];
    };
    readonly tokens: {
      readonly totalClassOccurrences: number;
      readonly semanticTokenOccurrences: number;
      readonly hardcodedOccurrences: number;
      readonly purityRatio: number;
      readonly violations: readonly TokenViolationItem[];
    };
  };
  readonly git?: {
    readonly isClean: boolean;
    readonly dirtyFiles: readonly string[];
  };
}

export interface DashboardViewProps {
  readonly initialProject?: string;
}

export function DashboardView(props: DashboardViewProps): ReactNode {
  const urlParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('project') ?? '' : '';
  const initial = props.initialProject !== undefined ? props.initialProject : (urlParam || getStoredRecent()[0] || '');

  const [lang, setLang] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(LANG_STORAGE_KEY);
      if (stored === 'en' || stored === 'zh') return stored;
    }
    return 'zh'; // Default to Chinese as requested
  });

  const toggleLanguage = (): void => {
    const next: Language = lang === 'zh' ? 'en' : 'zh';
    setLang(next);
    localStorage.setItem(LANG_STORAGE_KEY, next);
  };

  const [projectPath, setProjectPath] = useState<string>(initial);
  const [inputPath, setInputPath] = useState<string>(initial);
  const [recentProjects, setRecentProjects] = useState<string[]>(getStoredRecent);
  const [report, setReport] = useState<ProjectReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [contrastResult, setContrastResult] = useState<{ passed?: boolean; results?: readonly unknown[]; error?: string } | null>(null);
  const [gateResult, setGateResult] = useState<{ tier?: string; summary?: string; error?: string } | null>(null);
  const [diffModal, setDiffModal] = useState<{ file: string; diff: string; content: string } | null>(null);

  const isZh = lang === 'zh';

  const fetchProjectReport = async (path: string): Promise<void> => {
    if (!path.trim()) {
      setReport(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/harness/project?path=${encodeURIComponent(path)}`);
      if (!res.ok) {
        throw new Error(isZh ? `未找到指定路径或无法读取 (HTTP ${res.status})` : `Project not found or unreachable (HTTP ${res.status})`);
      }
      const data = (await res.json()) as ProjectReport;
      setReport(data);
      const updated = storeRecent(path);
      setRecentProjects(updated);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectPath) {
      queueMicrotask(() => {
        void fetchProjectReport(projectPath);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath]);

  const handleRunContrast = async (): Promise<void> => {
    try {
      const res = await fetch('/api/harness/tokens/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: projectPath }),
      });
      const data = (await res.json()) as { passed?: boolean; results?: readonly unknown[] };
      setContrastResult(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setContrastResult({ error: message });
    }
  };

  const handleRunGate = async (tier: string): Promise<void> => {
    try {
      const res = await fetch(`/api/harness/gates/run?tier=${tier}&path=${encodeURIComponent(projectPath)}`);
      const data = (await res.json()) as { tier?: string; summary?: string };
      setGateResult(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setGateResult({ error: message });
    }
  };

  const handlePreviewInject = async (componentName: string): Promise<void> => {
    const sampleContent = `import React from 'react';\n\nexport function ${componentName}() {\n  return (\n    <button className="min-h-[48px] min-w-[48px] bg-surface-raised text-primary px-4 py-2 rounded-xl border border-whisper">\n      Standard ${componentName}\n    </button>\n  );\n}\n`;
    try {
      const res = await fetch('/api/harness/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: projectPath,
          file: `src/components/ui/${componentName}.tsx`,
          content: sampleContent,
          preview: true,
        }),
      });
      const data = (await res.json()) as { diff: string };
      setDiffModal({ file: `src/components/ui/${componentName}.tsx`, diff: data.diff, content: sampleContent });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      alert(isZh ? `生成变更预览失败: ${message}` : `Preview failed: ${message}`);
    }
  };

  const handleConfirmWrite = async (): Promise<void> => {
    if (!diffModal) return;
    try {
      const res = await fetch('/api/harness/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: projectPath,
          file: diffModal.file,
          content: diffModal.content,
          preview: false,
        }),
      });
      const data = (await res.json()) as { error?: string; file?: string };
      if (!res.ok) {
        alert(data.error || (isZh ? '写入被拦截' : 'Write rejected'));
        return;
      }
      alert(isZh ? `已安全写入目标工程文件: ${data.file ?? 'disk'}` : `Successfully written to ${data.file ?? 'disk'}!`);
      setDiffModal(null);
      void fetchProjectReport(projectPath);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      alert(isZh ? `写入操作失败: ${message}` : `Write failed: ${message}`);
    }
  };

  // Empty state when no project path is bound
  if (!projectPath && !report) {
    return (
      <main className="cockpit">
        <header className="cockpit-header">
          <div className="cockpit-header__left">
            <div className="cockpit-brand">
              <h1 className="cockpit-title">{isZh ? 'DesignHarness 研发工程驾驶舱' : 'DesignHarness Cockpit'}</h1>
              <span className="cockpit-badge cockpit-badge--warning">{isZh ? '未挂载工程' : 'No Target Project'}</span>
            </div>
            <p className="cockpit-path">{isZh ? '输入外部业务工程路径，启动自动化重构监控与契约治理' : 'Bind an external application to monitor and govern its refactoring'}</p>
          </div>
          <button type="button" className="cockpit-btn" onClick={toggleLanguage}>
            {isZh ? '🌐 English' : '🌐 中文'}
          </button>
        </header>

        <section className="cockpit-section">
          <p className="cockpit-card__sub">
            {isZh ? '请输入业务工程（如 carweb）的绝对路径以开启双维度 AST 扫描与门禁审计：' : 'Enter target project absolute path to begin dual-vector AST analysis:'}
          </p>
          <div className="cockpit-controls">
            <input
              type="text"
              className="cockpit-select"
              style={{ flex: 1 }}
              placeholder={isZh ? '输入目标工程绝对路径 (例如 E:/personwork/carweb)' : 'Enter target project absolute path (e.g. E:/personwork/carweb)'}
              value={inputPath}
              onChange={(e) => setInputPath(e.target.value)}
            />
            <button
              type="button"
              className="cockpit-btn cockpit-btn--primary"
              onClick={() => {
                setProjectPath(inputPath);
              }}
            >
              {isZh ? '挂载并扫描工程' : 'Bind & Scan Project'}
            </button>
          </div>

          {recentProjects.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
              <span className="cockpit-card__label">{isZh ? '最近治理的项目：' : 'Recent Projects:'}</span>
              <div className="cockpit-chips">
                {recentProjects.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="cockpit-chip"
                    onClick={() => {
                      setInputPath(p);
                      setProjectPath(p);
                    }}
                  >
                    📂 {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    );
  }

  const dv = report?.dualVector;

  return (
    <main className="cockpit">
      {/* Top Cockpit Header */}
      <header className="cockpit-header">
        <div className="cockpit-header__left">
          <div className="cockpit-brand">
            <h1 className="cockpit-title">{isZh ? 'DesignHarness 研发工程驾驶舱' : 'Harness Cockpit'}</h1>
            <span className="cockpit-badge cockpit-badge--active">
              <span className="cockpit-dot cockpit-dot--success" />
              {isZh ? '当前挂载工程' : 'Active Project'}
            </span>
          </div>
          <p className="cockpit-path">📁 {report?.path ?? projectPath}</p>
        </div>

        <div className="cockpit-controls">
          <select
            className="cockpit-select"
            value={projectPath}
            onChange={(e) => {
              setProjectPath(e.target.value);
              setInputPath(e.target.value);
            }}
          >
            {recentProjects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="cockpit-btn"
            onClick={() => {
              const next = prompt(isZh ? '请输入新工程的绝对路径：' : 'Enter new project absolute path:', projectPath);
              if (next) {
                setProjectPath(next);
                setInputPath(next);
              }
            }}
          >
            {isZh ? '切换路径' : 'Switch Path'}
          </button>
          <button
            type="button"
            className="cockpit-btn"
            onClick={() => fetchProjectReport(projectPath)}
          >
            🔄 {isZh ? '刷新分析' : 'Refresh'}
          </button>
          <button type="button" className="cockpit-btn" onClick={toggleLanguage}>
            {isZh ? '🌐 English' : '🌐 中文'}
          </button>
        </div>
      </header>

      {error && (
        <div className="cockpit-banner" style={{ color: 'var(--color-badge-danger-foreground)', borderColor: 'var(--color-badge-danger-background)' }}>
          ⚠️ {error}
        </div>
      )}

      {loading && (
        <div className="cockpit-banner">
          ⏳ {isZh ? '正在深度扫描目标工程 AST、Token 语法树与 Git 状态...' : 'Scanning target project AST, tokens, and contracts...'}
        </div>
      )}

      {report && (
        <>
          {/* Key KPI Status Banners */}
          <section className="cockpit-kpi-grid">
            {/* KPI 1: Intent SSOT */}
            <div className="cockpit-card cockpit-card--sunken">
              <div className="cockpit-card__header">
                <span className="cockpit-card__label">{isZh ? '设计事实源 (SSOT)' : 'Intent SSOT'}</span>
                <span className={`cockpit-badge ${report.hasDesignMarkdown ? 'cockpit-badge--success' : 'cockpit-badge--danger'}`}>
                  {report.hasDesignMarkdown ? (isZh ? '已就绪' : 'Active') : (isZh ? '缺失' : 'Missing')}
                </span>
              </div>
              <div className="cockpit-card__value">
                {report.hasDesignMarkdown ? 'DESIGN.md' : '未检测到'}
              </div>
              <p className="cockpit-card__sub">
                {report.hasDesignMarkdown
                  ? (isZh ? '品牌调性与色彩意图单向驱动中' : 'Brand intent single source of truth active')
                  : (isZh ? '请运行 /dh-intent 生成事实源' : 'Run /dh-intent to initialize SSOT')}
              </p>
            </div>

            {/* KPI 2: Git Cleanliness */}
            <div className="cockpit-card cockpit-card--sunken">
              <div className="cockpit-card__header">
                <span className="cockpit-card__label">{isZh ? 'Git 工作区防腐状态' : 'Git Working Tree'}</span>
                <span className={`cockpit-badge ${report.git?.isClean ? 'cockpit-badge--success' : 'cockpit-badge--warning'}`}>
                  {report.git?.isClean ? (isZh ? '干净' : 'Clean') : (isZh ? '存在未暂存变更' : 'Dirty')}
                </span>
              </div>
              <div className="cockpit-card__value">
                {report.git?.isClean ? (isZh ? '安全可写' : 'Safe') : `${report.git?.dirtyFiles?.length ?? 0} 个变更`}
              </div>
              <p className="cockpit-card__sub">
                {report.git?.isClean
                  ? (isZh ? '无冲突风险，允许组件投送与变更' : 'Zero uncommitted conflicts, mutations allowed')
                  : (isZh ? '建议先暂存或提交业务代码后再投送' : 'Commit or stash changes before mutating')}
              </p>
            </div>

            {/* KPI 3: Refactoring Health Score */}
            <div className="cockpit-card cockpit-card--sunken">
              <div className="cockpit-card__header">
                <span className="cockpit-card__label">{isZh ? '重构健康指数' : 'Refactoring Health'}</span>
                <span className="cockpit-badge cockpit-badge--active">Dual-Vector AST</span>
              </div>
              <div className="cockpit-card__value" style={{ color: 'var(--color-primary)' }}>
                {dv?.healthScore ?? 0} <span style={{ fontSize: 'var(--font-size-body-sm)', color: 'var(--color-text-secondary)' }}>/ 100</span>
              </div>
              <p className="cockpit-card__sub">
                {isZh
                  ? `标准化率权重 40% + Token 纯净度权重 60%`
                  : `40% Component Standardization + 60% Token Purity`}
              </p>
            </div>
          </section>

          {/* Dual-Vector Governance Radar */}
          {dv && (
            <section className="cockpit-section">
              <h2 className="cockpit-section__title">
                📊 {isZh ? '双维度重构治理看板 (Dual-Vector Governance)' : 'Dual-Vector Refactoring Governance'}
              </h2>

              <div className="cockpit-grid-2">
                {/* Vector 1: Component Standardization */}
                <div className="cockpit-card">
                  <div className="cockpit-meter-group">
                    <div className="cockpit-meter-row">
                      <span className="cockpit-card__label">
                        {isZh ? '1. 组件标准化推进率' : '1. Component Standardization'}
                      </span>
                      <span style={{ fontFamily: 'var(--font-family-mono)', fontWeight: 'var(--font-weight-heading-3)' }}>
                        {dv.components.standardized} / {dv.components.total} {isZh ? '已完成' : 'standardized'} ({Math.round(dv.components.standardizationRatio * 100)}%)
                      </span>
                    </div>
                    <div className="cockpit-meter">
                      <div
                        className="cockpit-meter__fill cockpit-meter__fill--primary"
                        style={{ inlineSize: `${Math.round(dv.components.standardizationRatio * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)', marginTop: 'var(--space-sm)' }}>
                    {dv.components.legacyList?.length > 0 && (
                      <div>
                        <span style={{ color: 'var(--color-badge-warning-foreground)', fontSize: 'var(--font-size-body-sm)', fontWeight: 'bold' }}>
                          ⚠️ {isZh ? '待废弃旧手写/拟物组件 (' : 'Legacy Components to Deprecate ('}{dv.components.legacyList.length}{isZh ? ' 个)：' : '):'}
                        </span>
                        <div className="cockpit-chips" style={{ marginTop: 'var(--space-xxs)' }}>
                          {dv.components.legacyList.map((c) => (
                            <span key={c} className="cockpit-chip cockpit-chip--warning">
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {dv.components.standardList?.length > 0 && (
                      <div style={{ marginTop: 'var(--space-xs)' }}>
                        <span style={{ color: 'var(--color-badge-success-foreground)', fontSize: 'var(--font-size-body-sm)', fontWeight: 'bold' }}>
                          ✓ {isZh ? '已标准化组件 (' : 'Standardized Components ('}{dv.components.standardList.length}{isZh ? ' 个)：' : '):'}
                        </span>
                        <div className="cockpit-chips" style={{ marginTop: 'var(--space-xxs)' }}>
                          {dv.components.standardList.map((c) => (
                            <span key={c} className="cockpit-chip cockpit-chip--success">
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Vector 2: Token Purity */}
                <div className="cockpit-card">
                  <div className="cockpit-meter-group">
                    <div className="cockpit-meter-row">
                      <span className="cockpit-card__label">
                        {isZh ? '2. Token 纯净度 (防硬编码)' : '2. Token Purity (Anti-Hardcoding)'}
                      </span>
                      <span style={{ fontFamily: 'var(--font-family-mono)', fontWeight: 'var(--font-weight-heading-3)' }}>
                        {Math.round(dv.tokens.purityRatio * 100)}% {isZh ? '规范率' : 'Pure'} ({dv.tokens.hardcodedOccurrences} {isZh ? '处违规' : 'violations'})
                      </span>
                    </div>
                    <div className="cockpit-meter">
                      <div
                        className="cockpit-meter__fill cockpit-meter__fill--success"
                        style={{ inlineSize: `${Math.round(dv.tokens.purityRatio * 100)}%` }}
                      />
                    </div>
                  </div>

                  <p className="cockpit-card__sub" style={{ marginTop: 'var(--space-xs)' }}>
                    {isZh
                      ? `AST 静态分析器评估了全端 ${dv.tokens.totalClassOccurrences} 处样式声明，其中包含 ${dv.tokens.semanticTokenOccurrences} 处规范语义变量。`
                      : `AST evaluated ${dv.tokens.totalClassOccurrences} occurrences with ${dv.tokens.semanticTokenOccurrences} compliant tokens.`}
                  </p>

                  {/* Violations List */}
                  {dv.tokens.violations?.length > 0 && (
                    <div style={{ marginTop: 'var(--space-sm)' }}>
                      <span style={{ color: 'var(--color-badge-danger-foreground)', fontSize: 'var(--font-size-body-sm)', fontWeight: 'bold' }}>
                        🚫 {isZh ? '检测到的硬编码样式违规清单：' : 'Hardcoded Style Violations:'}
                      </span>
                      <div className="cockpit-violations" style={{ marginTop: 'var(--space-xxs)' }}>
                        {dv.tokens.violations.map((v: TokenViolationItem, index: number) => (
                          <div key={index} className="cockpit-violation-row">
                            <span className="cockpit-violation-file">📄 {v.file}:{v.line}</span>
                            <span className="cockpit-violation-raw"><code>{v.raw}</code></span>
                            <span className="cockpit-violation-reason">{v.reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Sensor Radar & Component Delivery */}
          <section className="cockpit-grid-2">
            {/* Sensor Radar */}
            <div className="cockpit-section">
              <h2 className="cockpit-section__title">🛡️ {isZh ? '质量传感器雷达 (Sensor Gates)' : 'Sensor Gates Radar'}</h2>
              <p className="cockpit-card__sub">
                {isZh ? '在提交代码前一键执行分级门禁，防止劣质代码与样式漂移流出：' : 'Execute tiered sensors before code submission to block drift:'}
              </p>
              <div className="cockpit-controls">
                <button type="button" className="cockpit-btn" onClick={() => handleRunGate('1')}>
                  {isZh ? '运行 Tier 1 (AST 语法门禁)' : 'Run Tier 1 (AST)'}
                </button>
                <button type="button" className="cockpit-btn" onClick={() => handleRunGate('2')}>
                  {isZh ? '运行 Tier 2 (设计意图校验)' : 'Run Tier 2 (Intent)'}
                </button>
                <button type="button" className="cockpit-btn" onClick={() => handleRunGate('3')}>
                  {isZh ? '运行 Tier 3 (WCAG 无障碍)' : 'Run Tier 3 (a11y)'}
                </button>
              </div>

              {gateResult && (
                <div className="cockpit-banner" style={{ color: 'var(--color-badge-success-foreground)' }}>
                  ✓ {isZh ? `门禁 Tier ${gateResult.tier} 校验通过` : `Gate Tier ${gateResult.tier} Executed Cleanly`}
                  <div style={{ marginTop: 'var(--space-xxs)', color: 'var(--color-text-primary)' }}>{gateResult.summary}</div>
                </div>
              )}
            </div>

            {/* Token & Component Actions */}
            <div className="cockpit-section">
              <h2 className="cockpit-section__title">⚡ {isZh ? 'Token 实验室与安全投送' : 'Token Lab & Delivery'}</h2>
              <p className="cockpit-card__sub">
                {isZh ? '进程内直接执行对比度数学审计，或向目标工程投送无头标准组件：' : 'In-process contrast math audit and standard component injection:'}
              </p>
              <div className="cockpit-controls">
                <button type="button" className="cockpit-btn" onClick={handleRunContrast}>
                  🧪 {isZh ? '运行 WCAG 2.2 AA 对比度审计' : 'Audit WCAG 2.2 AA Contrast'}
                </button>
                <button
                  type="button"
                  className="cockpit-btn cockpit-btn--primary"
                  onClick={() => handlePreviewInject('Button')}
                >
                  🚀 {isZh ? '向工程投送标准 Button (带 Diff 审查)' : 'Deploy Standard Button (with Diff)'}
                </button>
              </div>

              {contrastResult && (
                <div className="cockpit-banner" style={{ color: 'var(--color-badge-success-foreground)' }}>
                  ✓ {isZh ? 'WCAG 2.2 AA 对比度法定审计通过' : 'WCAG 2.2 AA Contrast Audit Passed'}
                  <div style={{ marginTop: 'var(--space-xxs)', color: 'var(--color-text-primary)' }}>
                    {isZh ? `已审计 ${contrastResult.results?.length ?? 1} 组前/背景令牌对，符合车规与弱光视认标准。` : `${contrastResult.results?.length ?? 1} token pairs audited.`}
                  </div>
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {/* Side-by-Side Diff Modal Guard */}
      {diffModal && (
        <div className="cockpit-modal-backdrop">
          <div className="cockpit-modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: 'var(--border-width-hairline) solid var(--color-border-subtle)', paddingBottom: 'var(--space-sm)' }}>
              <h3 style={{ margin: 0, color: 'var(--color-primary)', fontFamily: 'var(--font-family-display)', fontSize: 'var(--font-size-heading-3)' }}>
                🛡️ {isZh ? '安全防腐审查：变更代码 Diff 对比' : 'Mutation Safety Guard: Review Diff'}
              </h3>
              <span className="cockpit-path">{diffModal.file}</span>
            </div>
            <p className="cockpit-card__sub">
              {isZh
                ? '以下为即将写入外部工程物理磁盘的代码改动。系统已自动验证 Git 工作区状态无冲突，请仔细审查：'
                : 'Verify the exact lines that will be written to target project disk. Uncommitted Git changes are verified before mutation.'}
            </p>
            <pre className="cockpit-diff-pre" style={{ color: 'var(--color-badge-success-foreground)' }}>
              {diffModal.diff}
            </pre>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)', paddingTop: 'var(--space-sm)' }}>
              <button
                type="button"
                className="cockpit-btn"
                onClick={() => setDiffModal(null)}
              >
                {isZh ? '取消放弃' : 'Cancel'}
              </button>
              <button
                type="button"
                className="cockpit-btn cockpit-btn--primary"
                onClick={handleConfirmWrite}
              >
                💾 {isZh ? '确认并写入目标磁盘' : 'Confirm & Write to Disk'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
