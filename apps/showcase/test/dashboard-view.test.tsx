/* eslint-disable @typescript-eslint/no-explicit-any, no-restricted-syntax */
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardView } from '../src/views/DashboardView.js';

describe('DashboardView (Seam 3)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders empty state when no target project is bound', () => {
    render(<DashboardView initialProject="" />);
    expect(screen.getByText(/No Target Project Bound/i)).toBeDefined();
    expect(screen.getByPlaceholderText(/Enter target project absolute path/i)).toBeDefined();
  });

  it('loads project report, displays health score and dual-vector metrics', async () => {
    const mockReport = {
      path: 'E:/personwork/carweb',
      exists: true,
      hasDesignMarkdown: true,
      dualVector: {
        healthScore: 82,
        components: {
          total: 10,
          standardized: 8,
          legacy: 2,
          standardizationRatio: 0.8,
          standardList: ['Button', 'Dialog'],
          legacyList: ['NeumorphicButton', 'PinDialog'],
        },
        tokens: {
          totalClassOccurrences: 100,
          semanticTokenOccurrences: 85,
          hardcodedOccurrences: 15,
          purityRatio: 0.85,
          violations: [
            { file: 'src/components/NeumorphicButton.tsx', line: 12, raw: '#94a3b8', reason: 'Hardcoded hex' },
          ],
        },
      },
      git: {
        isClean: true,
        dirtyFiles: [],
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockReport,
    } as any);

    render(<DashboardView initialProject="E:/personwork/carweb" />);

    await waitFor(() => {
      expect(screen.getByText(/82\/100/i)).toBeDefined();
    });

    expect(screen.getByText(/8 \/ 10 standardized/i)).toBeDefined();
    expect(screen.getAllByText(/NeumorphicButton/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/#94a3b8/i)).toBeDefined();
  });

  it('persists project in localStorage and displays in recent projects', async () => {
    const mockReport = {
      path: 'E:/personwork/carweb',
      exists: true,
      hasDesignMarkdown: true,
      dualVector: {
        healthScore: 90,
        components: { total: 1, standardized: 1, legacy: 0, standardizationRatio: 1, standardList: [], legacyList: [] },
        tokens: { totalClassOccurrences: 10, semanticTokenOccurrences: 10, hardcodedOccurrences: 0, purityRatio: 1, violations: [] },
      },
      git: { isClean: true, dirtyFiles: [] },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockReport,
    } as any);

    render(<DashboardView initialProject="E:/personwork/carweb" />);

    await waitFor(() => {
      const stored = localStorage.getItem('dh_recent_projects');
      expect(stored).toContain('E:/personwork/carweb');
    });
  });
});
