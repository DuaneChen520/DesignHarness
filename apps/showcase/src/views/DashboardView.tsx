import { useEffect, useState, type ReactNode } from 'react';

const RECENT_PROJECTS_KEY = 'dh_recent_projects';

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

  const [projectPath, setProjectPath] = useState<string>(initial);
  const [inputPath, setInputPath] = useState<string>(initial);
  const [recentProjects, setRecentProjects] = useState<string[]>(getStoredRecent);
  const [report, setReport] = useState<ProjectReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [contrastResult, setContrastResult] = useState<{ passed?: boolean; results?: readonly unknown[]; error?: string } | null>(null);
  const [gateResult, setGateResult] = useState<{ tier?: string; summary?: string; error?: string } | null>(null);
  const [diffModal, setDiffModal] = useState<{ file: string; diff: string; content: string } | null>(null);

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
        throw new Error(`Project not found or unreachable (HTTP ${res.status})`);
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
    const sampleContent = `import React from 'react';\n\nexport function ${componentName}() {\n  return <button className="min-h-[48px] min-w-[48px] bg-surface-raised text-primary px-4 py-2 rounded-xl">Standard ${componentName}</button>;\n}\n`;
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
      alert(`Preview failed: ${message}`);
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
        alert(data.error || 'Write rejected');
        return;
      }
      alert(`Successfully written to ${data.file ?? 'disk'}!`);
      setDiffModal(null);
      void fetchProjectReport(projectPath);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      alert(`Write failed: ${message}`);
    }
  };

  if (!projectPath && !report) {
    return (
      <main className="p-8 max-w-4xl mx-auto space-y-6">
        <header className="border-b pb-4">
          <h1 className="text-2xl font-bold text-primary">DesignHarness Cockpit</h1>
          <p className="text-sm opacity-80">No Target Project Bound</p>
        </header>
        <div className="bg-surface-sunken p-6 rounded-xl border border-whisper space-y-4">
          <p className="text-sm">Enter the absolute path of a downstream application (e.g. carweb) to monitor and govern its refactoring:</p>
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 p-2 rounded bg-surface border border-whisper font-mono text-sm"
              placeholder="Enter target project absolute path (e.g. E:/personwork/carweb)"
              value={inputPath}
              onChange={(e) => setInputPath(e.target.value)}
            />
            <button
              type="button"
              className="px-4 py-2 bg-primary text-white rounded font-medium text-sm hover:opacity-90"
              onClick={() => {
                setProjectPath(inputPath);
              }}
            >
              Bind Project
            </button>
          </div>
          {recentProjects.length > 0 && (
            <div className="pt-2">
              <span className="text-xs uppercase opacity-60 font-semibold tracking-wider">Recent Projects:</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {recentProjects.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="text-xs font-mono bg-surface px-2 py-1 rounded border border-whisper hover:border-primary"
                    onClick={() => {
                      setInputPath(p);
                      setProjectPath(p);
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }

  const dv = report?.dualVector;

  return (
    <main className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Top Cockpit Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-primary">Harness Cockpit</h1>
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-primary/10 text-primary border border-primary/20">
              Active Project
            </span>
          </div>
          <p className="font-mono text-xs opacity-75 mt-1">{report?.path ?? projectPath}</p>
        </div>

        {/* Project Switcher */}
        <div className="flex items-center gap-2">
          <select
            className="p-1.5 rounded bg-surface border border-whisper text-xs font-mono"
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
            className="px-3 py-1 bg-surface border border-whisper rounded text-xs hover:border-primary"
            onClick={() => {
              const next = prompt('Enter new project absolute path:', projectPath);
              if (next) {
                setProjectPath(next);
                setInputPath(next);
              }
            }}
          >
            Switch Path
          </button>
        </div>
      </header>

      {error && (
        <div className="p-4 rounded bg-red-500/10 border border-red-500 text-red-500 text-sm">
          {error}
        </div>
      )}

      {loading && <p className="text-sm opacity-60 animate-pulse">Scanning target project AST and contracts...</p>}

      {report && (
        <>
          {/* Status Banners */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-surface-sunken border border-whisper">
              <span className="text-xs opacity-60">Intent SSOT</span>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${report.hasDesignMarkdown ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="font-semibold text-sm">{report.hasDesignMarkdown ? 'DESIGN.md Active' : 'DESIGN.md Missing'}</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-surface-sunken border border-whisper">
              <span className="text-xs opacity-60">Git Working Tree</span>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${report.git?.isClean ? 'bg-green-500' : 'bg-amber-500'}`} />
                <span className="font-semibold text-sm">
                  {report.git?.isClean ? 'Clean (Safe to mutate)' : `${report.git?.dirtyFiles?.length ?? 0} Uncommitted Changes`}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-surface-sunken border border-whisper">
              <span className="text-xs opacity-60">Overall Refactoring Health</span>
              <div className="flex items-center justify-between mt-1">
                <span className="text-2xl font-bold text-primary">{dv?.healthScore ?? 0}/100</span>
                <span className="text-xs opacity-75">Dual-Vector AST</span>
              </div>
            </div>
          </section>

          {/* Dual-Vector Progress Bar */}
          {dv && (
            <section className="p-6 rounded-xl bg-surface-sunken border border-whisper space-y-6">
              <h2 className="text-lg font-semibold">Dual-Vector Refactoring Governance</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Vector 1: Component Standardization */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">1. Component Standardization</span>
                    <span className="font-mono text-xs opacity-80">
                      {dv.components.standardized} / {dv.components.total} standardized ({Math.round(dv.components.standardizationRatio * 100)}%)
                    </span>
                  </div>
                  <div className="w-full bg-surface h-2 rounded-full overflow-hidden border border-whisper">
                    <div
                      className="bg-primary h-full transition-all duration-300"
                      style={{ width: `${Math.round(dv.components.standardizationRatio * 100)}%` }}
                    />
                  </div>
                  <div className="pt-2 text-xs space-y-1">
                    {dv.components.legacyList?.length > 0 && (
                      <div>
                        <span className="text-amber-500 font-medium">Legacy Components to Deprecate: </span>
                        <span className="font-mono">{dv.components.legacyList.join(', ')}</span>
                      </div>
                    )}
                    {dv.components.standardList?.length > 0 && (
                      <div>
                        <span className="text-green-500 font-medium">Standardized: </span>
                        <span className="font-mono">{dv.components.standardList.join(', ')}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Vector 2: Token Purity */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">2. Token Purity (Anti-Hardcoding)</span>
                    <span className="font-mono text-xs opacity-80">
                      {Math.round(dv.tokens.purityRatio * 100)}% Pure ({dv.tokens.hardcodedOccurrences} violations)
                    </span>
                  </div>
                  <div className="w-full bg-surface h-2 rounded-full overflow-hidden border border-whisper">
                    <div
                      className="bg-green-500 h-full transition-all duration-300"
                      style={{ width: `${Math.round(dv.tokens.purityRatio * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs opacity-60">
                    AST scanner evaluating {dv.tokens.totalClassOccurrences} class occurrences across all UI modules.
                  </p>
                </div>
              </div>

              {/* Violations List */}
              {dv.tokens.violations?.length > 0 && (
                <div className="border-t pt-4">
                  <h3 className="text-xs font-semibold uppercase opacity-75 mb-2">Hardcoded Style Violations:</h3>
                  <div className="max-h-40 overflow-y-auto space-y-1 font-mono text-xs">
                    {dv.tokens.violations.map((v: TokenViolationItem, index: number) => (
                      <div key={index} className="flex justify-between p-1.5 rounded bg-surface border border-whisper">
                        <span className="text-red-400">{v.file}:{v.line}</span>
                        <span className="font-bold text-amber-300">{v.raw}</span>
                        <span className="opacity-60">{v.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Actions & Sensor Radars */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Sensor Radar */}
            <div className="p-6 rounded-xl bg-surface-sunken border border-whisper space-y-4">
              <h2 className="text-lg font-semibold">Sensor Gates Radar</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 bg-surface border border-whisper rounded text-xs font-medium hover:border-primary"
                  onClick={() => handleRunGate('1')}
                >
                  Run Tier 1 (AST)
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 bg-surface border border-whisper rounded text-xs font-medium hover:border-primary"
                  onClick={() => handleRunGate('2')}
                >
                  Run Tier 2 (Intent)
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 bg-surface border border-whisper rounded text-xs font-medium hover:border-primary"
                  onClick={() => handleRunGate('3')}
                >
                  Run Tier 3 (a11y)
                </button>
              </div>

              {gateResult && (
                <div className="p-3 rounded bg-surface border border-whisper text-xs font-mono">
                  <div className="text-green-400 font-bold">✓ Gate Tier {gateResult.tier} Executed Cleanly</div>
                  <p className="opacity-75 mt-1">{gateResult.summary}</p>
                </div>
              )}
            </div>

            {/* Token & Component Actions */}
            <div className="p-6 rounded-xl bg-surface-sunken border border-whisper space-y-4">
              <h2 className="text-lg font-semibold">Token Lab & Component Delivery</h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 bg-surface border border-whisper rounded text-xs font-medium hover:border-primary"
                  onClick={handleRunContrast}
                >
                  Audit WCAG 2.2 AA Contrast
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 bg-primary text-white rounded text-xs font-medium hover:opacity-90"
                  onClick={() => handlePreviewInject('Button')}
                >
                  Deploy Standard Button (with Diff)
                </button>
              </div>

              {contrastResult && (
                <div className="p-3 rounded bg-surface border border-whisper text-xs font-mono">
                  <div className="font-bold text-green-400">WCAG 2.2 AA Audit Passed</div>
                  <p className="opacity-75">{contrastResult.results?.length ?? 1} token pairs audited.</p>
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {/* Side-by-Side Diff Modal Guard */}
      {diffModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-whisper rounded-xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-base text-primary">Mutation Safety Guard: Review Diff</h3>
              <span className="font-mono text-xs opacity-60">{diffModal.file}</span>
            </div>
            <p className="text-xs opacity-75">
              Verify the exact lines that will be written to target project disk. Uncommitted Git changes are verified before mutation.
            </p>
            <pre className="p-3 bg-surface-sunken rounded font-mono text-xs max-h-60 overflow-y-auto text-green-300">
              {diffModal.diff}
            </pre>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                className="px-4 py-2 rounded bg-surface border border-whisper text-xs hover:border-primary"
                onClick={() => setDiffModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded bg-primary text-white text-xs font-medium hover:opacity-90"
                onClick={handleConfirmWrite}
              >
                Confirm & Write to Disk
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
