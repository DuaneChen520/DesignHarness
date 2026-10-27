import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { auditContrast, auditPairs, generateArtifact } from '../src/index.js';

const DESIGN_MD = fileURLToPath(new URL('../../../DESIGN.md', import.meta.url));

describe('gates.auditContrast (WCAG 2.2 hard gate)', () => {
  it('reports all component/UI/text pairs and PASSES on the real artifact', async () => {
    const { artifact } = await generateArtifact(DESIGN_MD);
    const report = auditContrast(artifact);
    expect(report.results.length).toBeGreaterThan(5);
    // WCAG 2.2 AA is the only hard gate: no failures means the token set is compliant.
    expect(report.failures).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it('always produces a ratio + an (advisory) Lc for each pair', async () => {
    const { artifact } = await generateArtifact(DESIGN_MD);
    const report = auditContrast(artifact);
    for (const r of report.results) {
      expect(Number.isFinite(r.ratio)).toBe(true);
      // APCA never blocks: lc is either a finite number or undefined, never throws.
      expect(r.lc === undefined || Number.isFinite(r.lc)).toBe(true);
    }
    expect(Array.isArray(report.warnings)).toBe(true);
  });

  it('flags a genuinely failing pair without being influenced by APCA', async () => {
    const { artifact } = await generateArtifact(DESIGN_MD);
    // primary vs primary-hover are near-identical blues — must fail AA text contrast.
    const report = auditPairs(
      [{ id: 'bad', fgPath: 'color.semantic.primary', bgPath: 'color.semantic.primary-hover', kind: 'text' }],
      artifact,
    );
    expect(report.results).toHaveLength(1);
    expect(report.results[0]?.pass).toBe(false);
    expect(report.passed).toBe(false);
    expect(report.failures.map((f) => f.id)).toContain('bad');
    // Yet APCA still reported for diagnostics regardless of the pass/fail outcome.
    expect(report.results[0]?.lc === undefined || Number.isFinite(report.results[0]?.lc)).toBe(true);
  });

  it('classifies non-text UI pairs at the 3:1 threshold (SC 1.4.11)', async () => {
    const { artifact } = await generateArtifact(DESIGN_MD);
    const report = auditContrast(artifact);
    const ui = report.results.filter((r) => r.kind === 'ui');
    expect(ui.length).toBeGreaterThan(0);
    for (const r of ui) {
      expect(r.uiAA).toBe(r.ratio >= 3);
    }
  });
});
