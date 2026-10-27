/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleHarnessApi } from '../server/harness-api.js';

interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  setHeader(name: string, value: string): void;
  end(chunk?: string): void;
}

function createMockRes(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    },
    end(chunk = '') {
      this.body = chunk;
    },
  };
  return res;
}

describe('HarnessApiMiddleware (Seam 1)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'dh-harness-api-test-'));
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error on Windows
    }
  });

  it('GET /api/harness/project returns project metadata and dual-vector metrics', async () => {
    writeFileSync(join(tempDir, 'DESIGN.md'), '# CarWeb Design\n');
    const compDir = join(tempDir, 'src/components/ui');
    mkdirSync(compDir, { recursive: true });
    writeFileSync(
      join(compDir, 'Button.tsx'),
      'export function Button() { return <button className="bg-surface-raised text-primary">Btn</button>; }',
    );

    const req: any = {
      method: 'GET',
      url: `/api/harness/project?path=${encodeURIComponent(tempDir)}`,
    };
    const res = createMockRes();

    const handled = await handleHarnessApi(req, res as any);
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);

    const payload = JSON.parse(res.body);
    expect(payload.exists).toBe(true);
    expect(payload.hasDesignMarkdown).toBe(true);
    expect(payload.dualVector.healthScore).toBe(100);
    expect(payload.dualVector.components.standardized).toBe(1);
  });

  it('GET /api/harness/project returns 404 for non-existent path', async () => {
    const nonExistent = join(tempDir, 'does-not-exist');
    const req: any = {
      method: 'GET',
      url: `/api/harness/project?path=${encodeURIComponent(nonExistent)}`,
    };
    const res = createMockRes();

    const handled = await handleHarnessApi(req, res as any);
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/harness/tokens/build runs in-process contrast audit and returns results', async () => {
    const req: any = {
      method: 'POST',
      url: '/api/harness/tokens/build',
      body: { path: tempDir },
    };
    const res = createMockRes();

    const handled = await handleHarnessApi(req, res as any);
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);

    const payload = JSON.parse(res.body);
    expect(payload.standard).toBe('WCAG 2.2 AA');
    expect(typeof payload.passed).toBe('boolean');
    expect(Array.isArray(payload.results)).toBe(true);
  });

  it('POST /api/harness/mutate generates diff preview and blocks unconfirmed writes', async () => {
    const targetFile = join(tempDir, 'DESIGN.md');
    writeFileSync(targetFile, '# Old Intent\n', 'utf8');

    // 1. Preview mode
    const previewReq: any = {
      method: 'POST',
      url: '/api/harness/mutate',
      body: {
        path: tempDir,
        file: 'DESIGN.md',
        content: '# New Intent\n',
        preview: true,
      },
    };
    const previewRes = createMockRes();
    await handleHarnessApi(previewReq, previewRes as any);

    expect(previewRes.statusCode).toBe(200);
    const previewPayload = JSON.parse(previewRes.body);
    expect(previewPayload.preview).toBe(true);
    expect(previewPayload.diff).toContain('-# Old Intent');
    expect(previewPayload.diff).toContain('+# New Intent');

    // 2. Commit write mode
    const writeReq: any = {
      method: 'POST',
      url: '/api/harness/mutate',
      body: {
        path: tempDir,
        file: 'DESIGN.md',
        content: '# New Intent\n',
        preview: false,
        skipGitCheck: true, // test temp directory is not a git repo
      },
    };
    const writeRes = createMockRes();
    await handleHarnessApi(writeReq, writeRes as any);

    expect(writeRes.statusCode).toBe(200);
    const writePayload = JSON.parse(writeRes.body);
    expect(writePayload.written).toBe(true);
  });
});
