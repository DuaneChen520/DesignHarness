/**
 * The Tailwind v4 target has to be real: `@theme` must actually drive utilities.
 *
 * `test/fixtures/tailwind-theme-fixture.css` imports the generated theme exactly like
 * a consumer would (`@designharness/tokens/tailwind` → `tailwind/theme.css`) and asks
 * Tailwind for utilities out of it. The suite compiles it with the installed
 * `@tailwindcss/cli` and asserts the emitted CSS references the compiled custom
 * properties. A negative control (an unknown utility) must fail the compile, so a
 * silently empty result can never look like a pass.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { freshBuildRoot, packageRoot, readGenerated } from './helpers/pipeline.js';

const require = createRequire(import.meta.url);

/** Absolute path of the `@tailwindcss/cli` entry (its `bin` field). */
function tailwindCliEntry(): string {
  return resolve(join(dirname(require.resolve('@tailwindcss/cli/package.json')), 'dist', 'index.mjs'));
}

const fixture = join(packageRoot, 'test', 'fixtures', 'tailwind-theme-fixture.css');
/** Scratch dir inside the package's own `node_modules` so bare specifiers resolve. */
const scratch = join(packageRoot, 'node_modules', '.cache', 'dh-tailwind-proof');
const outCss = join(scratch, 'compiled.css');

let compiled = '';
let compileFailure = '';

function compile(input: string, output: string): void {
  execFileSync(process.execPath, [tailwindCliEntry(), '--input', input, '--output', output], {
    cwd: packageRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

beforeAll(() => {
  mkdirSync(scratch, { recursive: true });
  try {
    compile(fixture, outCss);
    compiled = readFileSync(outCss, 'utf8');
  } catch (error) {
    const failure = error as { message?: string; stdout?: string; stderr?: string };
    compileFailure = [String(failure.message), String(failure.stdout), String(failure.stderr)].join('\n');
  }
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('Tailwind v4 @theme target', () => {
  it('publishes an @theme block built from the compiled artifact', () => {
    const theme = readGenerated(freshBuildRoot(), 'tailwind/theme.css');
    expect(theme).toContain('@theme {');
    expect(theme).not.toMatch(/undefined|NaN/);
    for (const key of [
      '--color-primary', '--color-surface', '--spacing-md', '--spacing-base', '--radius-md',
      '--text-body-md', '--text-heading-2', '--font-mono', '--ease-standard', '--shadow-elevation-1',
      '--size-height-md', '--default-transition-duration',
    ]) {
      expect(theme, `@theme is missing ${key}`).toContain(`${key}:`);
    }
    expect(theme).toContain('oklch(');
    expect(theme).toContain('cubic-bezier(');
    // The published package copy must be identical to the freshly generated one.
    expect(readGenerated(packageRoot, 'tailwind/theme.css')).toBe(theme);
  });

  it('compiles the fixture with @tailwindcss/cli', () => {
    expect(compileFailure, 'the Tailwind CLI failed to compile the fixture').toBe('');
    expect(compiled).toContain('--color-primary');
    expect(compiled.length).toBeGreaterThan(1000);
  });

  it('resolves colour utilities through the semantic tier', () => {
    expect(compiled).toMatch(/\.dh-proof-bg\s*\{[^}]*background-color:\s*var\(--color-primary\)/s);
    expect(compiled).toMatch(/\.dh-proof-ink\s*\{[^}]*color:\s*var\(--color-on-primary\)/s);
    expect(compiled).toMatch(/\.dh-proof-surface\s*\{[^}]*background-color:\s*var\(--color-surface\)/s);
    expect(compiled).toMatch(/\.dh-proof-surface\s*\{[^}]*color:\s*var\(--color-text-primary\)/s);
  });

  it('resolves spacing, radius, type, shadow, easing and font-family utilities', () => {
    expect(compiled).toMatch(/\.dh-proof-pad\s*\{[^}]*padding:\s*var\(--spacing-md\)/s);
    expect(compiled).toMatch(/\.dh-proof-gap\s*\{[^}]*gap:\s*var\(--spacing-lg\)/s);
    expect(compiled).toMatch(/\.dh-proof-round\s*\{[^}]*border-radius:\s*var\(--radius-md\)/s);
    expect(compiled).toMatch(/\.dh-proof-radius-full\s*\{[^}]*border-radius:\s*var\(--radius-full\)/s);
    expect(compiled).toMatch(/\.dh-proof-type\s*\{[^}]*font-size:\s*var\(--text-body-md\)/s);
    expect(compiled).toMatch(/\.dh-proof-heading\s*\{[^}]*font-size:\s*var\(--text-heading-2\)/s);
    expect(compiled).toMatch(/\.dh-proof-font\s*\{[^}]*font-family:\s*var\(--font-mono\)/s);
    expect(compiled).toMatch(/\.dh-proof-ease\s*\{[^}]*transition-timing-function:\s*var\(--ease-standard\)/s);
    expect(compiled).toMatch(/\.dh-proof-shadow\s*\{/s);
  });

  it('emits the theme variables themselves so the utilities resolve at runtime', () => {
    expect(compiled).toMatch(/--color-primary:\s*oklch\(/);
    expect(compiled).toMatch(/--spacing-md:\s*16px/);
    expect(compiled).toMatch(/--radius-md:\s*8px/);
    expect(compiled).toMatch(/--text-body-md:\s*1rem/);
  });

  it('fails the compile on a utility the theme does not define (negative control)', () => {
    const control = join(scratch, 'control.css');
    writeFileSync(control, '@import "tailwindcss";\n@import "../../../tailwind/theme.css";\n.dh-control { @apply bg-not-a-token; }\n', 'utf8');
    let status = 0;
    let message = '';
    try {
      compile(control, join(scratch, 'control-out.css'));
    } catch (error) {
      const failure = error as { message?: string; stdout?: string; stderr?: string };
      status = 1;
      message = [String(failure.message), String(failure.stdout), String(failure.stderr)].join('\n');
    }
    expect(status, 'an unknown utility must not compile').toBe(1);
    expect(message).toMatch(/bg-not-a-token/i);
  });
});
