/**
 * Playwright configuration for the showcase sensors.
 *
 * RESEARCH.md §7 puts cross-browser visual regression in Tier 4 (nightly / release) and the
 * WCAG 2.2 axe assertions in Tier 3 (every PR), so this file is the single source of both:
 * `--project` and `--grep @a11y` select which sensor runs, and `tier3-standard.mjs` /
 * `tier4-release.mjs` are the scripts that call them.
 *
 * Browser selection is *detected*, not assumed. A project is emitted only for a browser this
 * machine can actually launch: `chromium` uses Playwright's own build when it is installed and
 * falls back to a system Chrome/Edge channel when it is not, and firefox/webkit appear when
 * their binaries exist. A missing browser is printed as a loud warning at config load — the
 * suite never quietly "passes" on a smaller matrix than CI will run.
 */
import { chromium, firefox, webkit } from 'playwright';
import type { Project, PlaywrightTestConfig } from '@playwright/test';
import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { SHOWCASE_PORT } from './vite.config.js';

export const BASE_URL = `http://localhost:${String(SHOWCASE_PORT)}`;

type BrowserType = typeof chromium;

function installed(type: BrowserType): boolean {
  try {
    return existsSync(type.executablePath());
  } catch {
    return false;
  }
}

/**
 * Playwright's bundled Chromium is not the only honest way to run the chromium project: a
 * system Chrome (the same "Chrome for Testing" lineage `browsers.json` pins) launches through
 * the `chrome` channel, and Edge through `msedge`.
 */
function systemChromiumChannel(): 'chrome' | 'msedge' | undefined {
  const roots = [process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'], process.env['LOCALAPPDATA']]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map((root) => path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'));

  if (roots.some((candidate) => existsSync(candidate))) {
    return 'chrome';
  }

  const edge = [process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)']]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map((root) => path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));

  return edge.some((candidate) => existsSync(candidate)) ? 'msedge' : undefined;
}

interface DetectedBrowser {
  readonly name: 'chromium' | 'firefox' | 'webkit';
  readonly device: keyof typeof devices;
  readonly channel?: 'chrome' | 'msedge';
}

function detectBrowsers(): DetectedBrowser[] {
  const detected: DetectedBrowser[] = [];

  if (installed(chromium)) {
    detected.push({ name: 'chromium', device: 'Desktop Chrome' });
  } else {
    const channel = systemChromiumChannel();
    if (channel === undefined) {
      console.warn('[showcase/e2e] WARNING: no Playwright Chromium build and no system Chrome/Edge — the chromium project is dropped.');
    } else {
      console.warn(
        `[showcase/e2e] NOTE: Playwright's own Chromium build is not installed on this machine; the chromium project runs on the system "${channel}" channel instead. Snapshot baselines are per project and per platform, and CI regenerates them on its own Chromium.`,
      );
      detected.push({ name: 'chromium', device: 'Desktop Chrome', channel });
    }
  }

  if (installed(firefox)) {
    detected.push({ name: 'firefox', device: 'Desktop Firefox' });
  } else {
    console.warn('[showcase/e2e] WARNING: Firefox is not installed (`playwright install firefox`) — the firefox project is dropped from this run.');
  }

  if (installed(webkit)) {
    detected.push({ name: 'webkit', device: 'Desktop Safari' });
  } else {
    console.warn('[showcase/e2e] WARNING: WebKit is not installed (`playwright install webkit`) — the webkit project is dropped from this run.');
  }

  return detected;
}

const detectedBrowsers = detectBrowsers();

const projects: Project[] = detectedBrowsers.map((browser) => ({
  name: browser.name,
  use: {
    ...devices[browser.device],
    ...(browser.channel === undefined ? {} : { channel: browser.channel }),
  },
}));

if (projects.length === 0) {
  throw new Error(
    '[showcase/e2e] no launchable browser was detected, so the sensor suite would assert nothing. Install a browser: pnpm --filter @designharness/showcase exec playwright install chromium',
  );
}

const config: PlaywrightTestConfig = {
  testDir: './e2e',
  outputDir: './test-results',
  snapshotDir: './e2e/__screenshots__',
  // `{...}{-projectName}` is what keeps one baseline per kernel instead of three projects
  // fighting over one image.
  snapshotPathTemplate: '{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}{-platform}{ext}',
  timeout: 120_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      // Playwright's own stabilisation: animations, caret and scrollbars are frozen before
      // the hash is taken. It does not tolerance away a real diff — `maxDiffPixels` is left
      // at the default 0.
      animations: 'disabled',
      caret: 'hide',
    },
  },
  fullyParallel: false,
  workers: projects.length > 1 ? 2 : 1,
  retries: process.env['CI'] === undefined ? 0 : 2,
  forbidOnly: process.env['CI'] !== undefined,
  reporter: process.env['CI'] === undefined ? [['list'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }], ['github']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    colorScheme: 'light',
    reducedMotion: 'no-preference',
    launchOptions: { slowMo: 0 },
  },
  webServer: {
    command: 'pnpm run build && pnpm run preview',
    url: BASE_URL,
    reuseExistingServer: process.env['CI'] === undefined,
    timeout: 300_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  projects,
};

export default defineConfig(config);
