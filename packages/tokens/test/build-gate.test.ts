/**
 * The pipeline's own gates, exercised end-to-end.
 *
 * "tokens.json is machine-generated only" is only true if a build refuses to run on
 * drift, so this suite drills the real `scripts/build.mjs` inside scratch package
 * roots (never the checked-in tree): determinism, the hand-edit gate, the Tier-2
 * intent-lint gate and the WCAG 2.2 contrast gate.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { designMdPath, freshBuildRoot, packageRoot, runBuild, scratchRoot } from './helpers/pipeline.js';

/** Build a scratch root from a given intent file, without compiling the runtime module. */
function buildInto(root: string, intent: string, extra: readonly string[] = []) {
  return runBuild(['--root', root, '--design-md', intent, '--no-compile', '--quiet', ...extra]);
}

/** The real intent file, optionally changed in exactly one place. */
function intentCopy(mutate?: (source: string) => string): string {
  const source = readFileSync(designMdPath, 'utf8');
  return mutate === undefined ? source : mutate(source);
}

const TARGETS = [
  'tokens.json',
  'dist/css/index.css',
  'dist/css/light.css',
  'dist/css/dark.css',
  'dist/css/high-contrast.css',
  'dist/css/high-contrast-dark.css',
  'dist/json/tokens.json',
  'dist/recipe/index.js',
  'dist/recipe/index.d.ts',
  'tailwind/theme.css',
  'src/generated/token-data.ts',
];

describe('build determinism', () => {
  it('regenerates byte-identical output in a second, independent run', () => {
    const a = scratchRoot('det-a');
    const b = scratchRoot('det-b');
    const intent = join(a, 'DESIGN.md');
    writeFileSync(intent, intentCopy(), 'utf8');
    expect(buildInto(a, intent).status).toBe(0);
    expect(buildInto(b, intent).status).toBe(0);
    for (const target of TARGETS) {
      const left = readFileSync(join(a, target), 'utf8');
      const right = readFileSync(join(b, target), 'utf8');
      expect(right === left, `${target} is not deterministic`).toBe(true);
    }
  });

  it('does not rewrite the checked-in artifact on a second build', () => {
    const artifactPath = join(packageRoot, 'tokens.json');
    const before = statSync(artifactPath);
    const result = runBuild([]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('unchanged  tokens.json');
    const after = statSync(artifactPath);
    // An untouched file keeps its mtime and inode; a rewrite would not.
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(after.ino).toBe(before.ino);
    expect(after.size).toBe(before.size);
  });
});

describe('idempotence gate (tokens.json is machine-generated only)', () => {
  it('refuses to run when the artifact was hand-edited and reports a diff', () => {
    const root = scratchRoot('drift');
    const intent = join(root, 'DESIGN.md');
    writeFileSync(intent, intentCopy(), 'utf8');
    expect(buildInto(root, intent).status).toBe(0);

    const artifactPath = join(root, 'tokens.json');
    const canonical = readFileSync(artifactPath, 'utf8');
    const parsed = JSON.parse(canonical) as { color: { primitive: Record<string, { $value: string }> } };
    // A realistic hand edit: someone "fixed" a colour in the artifact instead of
    // repairing DESIGN.md, which is exactly what this gate exists to catch.
    parsed.color.primitive.primary.$value = 'oklch(0.5 0.2 300)';
    writeFileSync(artifactPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');

    const blocked = buildInto(root, intent);
    expect(blocked.status, 'a hand-edited artifact must fail the build').not.toBe(0);
    expect(blocked.stderr).toMatch(/DRIFT tokens\.json/u);
    expect(blocked.stderr).toMatch(/machine-generated only/u);
    expect(blocked.stderr).toMatch(/- L\d+:/u);
    expect(blocked.stderr).toMatch(/\+ L\d+:/u);
    // Refusing to run means refusing to silently overwrite the evidence.
    expect(readFileSync(artifactPath, 'utf8')).toContain('oklch(0.5 0.2 300)');
  });

  it('repairs only when the regeneration is explicitly accepted', () => {
    const root = scratchRoot('drift-accept');
    const intent = join(root, 'DESIGN.md');
    writeFileSync(intent, intentCopy(), 'utf8');
    expect(buildInto(root, intent).status).toBe(0);
    const artifactPath = join(root, 'tokens.json');
    const canonical = readFileSync(artifactPath, 'utf8');
    writeFileSync(artifactPath, `${canonical.replace(/\n$/, '\n')}\n`, 'utf8');
    expect(buildInto(root, intent).status).not.toBe(0);
    expect(buildInto(root, intent, ['--write']).status).toBe(0);
    expect(readFileSync(artifactPath, 'utf8')).toBe(canonical);
  });

  it('catches a hand-edited CSS output too, not just the artifact', () => {
    const root = scratchRoot('drift-css');
    const intent = join(root, 'DESIGN.md');
    writeFileSync(intent, intentCopy(), 'utf8');
    expect(buildInto(root, intent).status).toBe(0);
    const cssPath = join(root, 'dist/css/dark.css');
    writeFileSync(cssPath, `${readFileSync(cssPath, 'utf8')}\n/* tuned by hand */\n`, 'utf8');
    const blocked = buildInto(root, intent);
    expect(blocked.status).not.toBe(0);
    expect(blocked.stderr).toMatch(/DRIFT dist\/css\/dark\.css/u);
  });

  it('still matches the checked-in tree, which is what consumers see', () => {
    expect(readFileSync(join(packageRoot, 'tokens.json'), 'utf8')).toBe(readFileSync(join(freshBuildRoot(), 'tokens.json'), 'utf8'));
  });
});

describe('Tier-2 intent gate', () => {
  it('fails the build when DESIGN.md does not lint', () => {
    const root = scratchRoot('lint');
    const intent = join(root, 'DESIGN.md');
    // A malformed brand colour is a hard linter error (Tier-2), and it must stop the
    // pipeline before a single token is generated from it.
    writeFileSync(intent, intentCopy((source) => source.replace('primary: "#1A5FD0"', 'primary: "not-a-colour"')), 'utf8');
    const result = buildInto(root, intent);
    expect(result.status, 'a broken intent file must block the pipeline').not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/DESIGN\.md failed the @google\/design\.md lint/u);
    expect(`${result.stdout}${result.stderr}`).toMatch(/errors 1/u);
    expect(existsSync(join(root, 'tokens.json'))).toBe(false);
    expect(existsSync(join(root, 'dist/css/index.css'))).toBe(false);
  });

  it('prints lint warnings as diagnostics without failing', () => {
    const root = scratchRoot('lint-warn');
    const intent = join(root, 'DESIGN.md');
    writeFileSync(intent, intentCopy(), 'utf8');
    const result = runBuild(['--root', root, '--design-md', intent, '--no-compile']);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/errors 0, warnings [1-9]\d*/u);
  });
});

describe('WCAG contrast gate', () => {
  it('refuses to emit tokens whose ink fails AA against its own surface', () => {
    const root = scratchRoot('contrast');
    const intent = join(root, 'DESIGN.md');
    writeFileSync(intent, intentCopy((source) => source.replace('text-secondary: "#4A5160"', 'text-secondary: "#D9DCE3"')), 'utf8');
    const result = buildInto(root, intent);
    expect(result.status, 'an illegible ink must fail the WCAG 2.2 gate').not.toBe(0);
    const output = `${result.stdout}${result.stderr}`;
    expect(output).toMatch(/WCAG 2\.2 AA contrast gate failed/u);
    expect(output).toMatch(/text-secondary on color\.semantic\.surface/u);
    // A failing gate must not leave a half-built artifact behind.
    expect(existsSync(join(root, 'dist/css/index.css'))).toBe(false);
    expect(existsSync(join(root, 'tailwind/theme.css'))).toBe(false);
  });

  it('reports APCA advisories but never lets them block', () => {
    const root = scratchRoot('apca');
    const result = runBuild(['--root', root, '--design-md', designMdPath, '--no-compile', '--write']);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/apca advisory/u);
    expect(result.stdout).toMatch(/0 WCAG failures/u);
    expect(result.stdout).toMatch(/not a gate/u);
  });
});
