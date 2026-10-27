/* eslint-disable no-restricted-syntax */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyzeDualVector } from '../src/index.js';

describe('DualVectorAnalyzer (AST & Component Metric)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'dh-dual-vector-test-'));
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore temp cleanup error on Windows
    }
  });

  it('correctly scores a clean project with 100% token purity and standard components', async () => {
    // Setup clean project
    writeFileSync(join(tempDir, 'DESIGN.md'), '# Design\n');
    const compDir = join(tempDir, 'src/components/ui');
    mkdirSync(compDir, { recursive: true });

    writeFileSync(
      join(compDir, 'Button.tsx'),
      `export function Button() {
        return <button className="bg-surface-raised text-primary border-whisper px-4 py-2">Click</button>;
      }`,
    );

    const report = await analyzeDualVector({ projectRoot: tempDir });

    expect(report.hasDesignMarkdown).toBe(true);
    expect(report.components.total).toBe(1);
    expect(report.components.standardized).toBe(1);
    expect(report.components.legacy).toBe(0);
    expect(report.components.standardizationRatio).toBe(1);

    expect(report.tokens.hardcodedOccurrences).toBe(0);
    expect(report.tokens.purityRatio).toBe(1);
    expect(report.tokens.violations).toHaveLength(0);
    expect(report.healthScore).toBe(100);
  });

  it('detects legacy components and hardcoded hex colors, accurately calculating ratio and violations', async () => {
    writeFileSync(join(tempDir, 'DESIGN.md'), '# Design\n');
    const compDir = join(tempDir, 'src/components');
    const uiDir = join(tempDir, 'src/components/ui');
    mkdirSync(uiDir, { recursive: true });

    // 1 standard component
    writeFileSync(
      join(uiDir, 'Button.tsx'),
      `export function Button() {
        return <button className="bg-surface-raised text-primary">Standard</button>;
      }`,
    );

    // 1 legacy component with hardcoded hex colors and legacy neumorphic styles
    writeFileSync(
      join(compDir, 'NeumorphicButton.tsx'),
      `export function NeumorphicButton() {
        const bg = '#1e293b';
        return (
          <button
            style={{ color: '#94a3b8' }}
            className="text-[#94a3b8] bg-[#0f172a] p-4"
          >
            Legacy
          </button>
        );
      }`,
    );

    const report = await analyzeDualVector({ projectRoot: tempDir });

    expect(report.hasDesignMarkdown).toBe(true);
    expect(report.components.total).toBe(2);
    expect(report.components.standardized).toBe(1);
    expect(report.components.legacy).toBe(1);
    expect(report.components.standardizationRatio).toBe(0.5);

    expect(report.tokens.hardcodedOccurrences).toBeGreaterThanOrEqual(3);
    expect(report.tokens.purityRatio).toBeLessThan(1);
    expect(report.tokens.violations.length).toBeGreaterThanOrEqual(3);

    // Verify violation structure
    const hexViolation = report.tokens.violations.find((v) => v.raw.includes('#94a3b8'));
    expect(hexViolation).toBeDefined();
    expect(hexViolation?.file).toContain('NeumorphicButton.tsx');

    // Health score should be proportional
    expect(report.healthScore).toBeLessThan(100);
    expect(report.healthScore).toBeGreaterThan(0);
  });

  it('handles missing DESIGN.md gracefully', async () => {
    const srcDir = join(tempDir, 'src');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, 'App.tsx'), 'export function App() { return <div />; }');

    const report = await analyzeDualVector({ projectRoot: tempDir });
    expect(report.hasDesignMarkdown).toBe(false);
  });
});
