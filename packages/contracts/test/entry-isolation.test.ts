import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Entry-point isolation.
 *
 * The delivery layer runs in two very different places: a Node test process,
 * where `msw/node` intercepts `fetch`, and a browser bundle, where
 * `msw/browser` installs a service worker. Neither may import the other — `msw`
 * enforces it in its own exports map (`msw/browser` resolves to `null` under
 * Node), so a stray import only surfaces as a build failure at the far end of a
 * pipeline. This is the one gate that can assert it without starting a browser,
 * and it reads the static import graph rather than the runtime one for exactly
 * that reason.
 *
 * Two properties make the gate usable rather than merely strict:
 *
 * 1. it reads *code*, not prose. The header of `src/index.ts` explains the
 *    isolation by naming `msw/node`, `msw/browser` and `node:fs`, and
 *    `src/handlers.ts` explains that it writes no `http.get(...)`. Naming the
 *    prohibition in a comment is documentation, not a violation, so comments are
 *    blanked before anything is matched — the gate stays sharp about imports and
 *    stops arguing with the docs.
 * 2. it reports the *file* at fault. `node:fs` is legitimately imported, by
 *    `openapi-loader.ts`, so an offender list of specifiers could never express
 *    "only this one module may touch it"; a list of files can, and does.
 */
const sourceDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

const IMPORTS = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORTS = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const REQUIRE_CALLS = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Quote characters that open a literal in the TypeScript source this gate reads. */
const QUOTES: readonly string[] = ['"', "'", '`'];

/**
 * Characters after which a `/` opens a regular expression literal instead of
 * starting a comment or a division. Recognising the literal is what keeps a
 * pattern such as `/\/+$/` from being mistaken for the start of a comment and
 * silently blanking the code that follows it.
 */
const REGEX_OPENERS: readonly string[] = ['=', '(', ',', ':', '[', '!', '&', '|', '?', '{', '}', ';', '\n', '\t', ' ', '+', '-', '*', '%', '<', '>', '~', '^'];

/** End of the string or template literal that starts at `from`, escape aware. */
function literalEnd(source: string, from: number, quote: string): number {
  for (let index = from + 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === '\\') {
      index += 1;
      continue;
    }
    if (character === quote) {
      return index + 1;
    }
  }
  return source.length;
}

/** End of the regular expression literal that starts at `from`. */
function regexLiteralEnd(source: string, from: number): number {
  let insideClass = false;
  for (let index = from + 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === '\\') {
      index += 1;
      continue;
    }
    if (character === '[') {
      insideClass = true;
    } else if (character === ']') {
      insideClass = false;
    } else if (character === '/' && !insideClass) {
      while (index + 1 < source.length && /[a-z]/.test(source[index + 1] ?? '')) {
        index += 1;
      }
      return index + 1;
    } else if (character === '\n' && !insideClass) {
      return index;
    }
  }
  return source.length;
}

/**
 * Blank every comment out of `source` while keeping each remaining token on its
 * original line: a block comment becomes the newlines it contained, so a comment
 * can never splice an import statement onto the line above it and hide it from
 * the specifier patterns below.
 */
function withoutComments(source: string): string {
  let output = '';
  let index = 0;
  let previous = '\n';

  while (index < source.length) {
    const character = source[index] ?? '';
    const next = source[index + 1];

    if (character === '/' && next === '/') {
      const end = source.indexOf('\n', index);
      index = end === -1 ? source.length : end;
      continue;
    }
    if (character === '/' && next === '*') {
      const close = source.indexOf('*/', index + 2);
      const end = close === -1 ? source.length : close + 2;
      output += '\n'.repeat((source.slice(index, end).match(/\n/g) ?? []).length);
      index = end;
      continue;
    }
    if (character === '/' && next !== undefined && next !== '=' && REGEX_OPENERS.includes(previous)) {
      const end = regexLiteralEnd(source, index);
      output += source.slice(index, end);
      index = end;
      previous = '/';
      continue;
    }
    if (QUOTES.includes(character)) {
      const end = literalEnd(source, index, character);
      output += source.slice(index, end);
      index = end;
      previous = character;
      continue;
    }
    output += character;
    previous = character;
    index += 1;
  }
  return output;
}

/** The code of one source file, comments blanked, read fresh from disk. */
const codeOf = (file: string): string => withoutComments(readFileSync(file, 'utf8'));

/** Every module specifier a file names, statically and, on request, dynamically. */
function specifiersOf(file: string, options: { readonly dynamic: boolean }): string[] {
  const code = codeOf(file);
  const patterns = options.dynamic ? [IMPORTS, DYNAMIC_IMPORTS, REQUIRE_CALLS] : [IMPORTS];
  const found: string[] = [];
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier) {
        found.push(specifier);
      }
    }
  }
  return found;
}

/** Resolve a relative specifier to a source file, mirroring NodeNext's rules. */
const moduleFile = (specifier: string, fromFile: string): string | undefined => {
  if (!specifier.startsWith('.')) {
    return undefined;
  }
  const base = join(dirname(fromFile), specifier.replace(/\.js$/, ''));
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
};

interface Graph {
  readonly files: readonly string[];
}

function reachable(entry: string, options: { readonly dynamic: boolean } = { dynamic: false }): Graph {
  const start = join(sourceDirectory, entry);
  const files = new Set<string>();
  const queue: string[] = [start];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || files.has(current)) {
      continue;
    }
    files.add(current);
    for (const specifier of specifiersOf(current, options)) {
      const nested = moduleFile(specifier, current);
      if (nested) {
        queue.push(nested);
      }
    }
  }
  return { files: [...files] };
}

const relative = (file: string): string => file.slice(sourceDirectory.length + 1).split(/[\\/]/).join('/');

/**
 * The reachable files that actually touch one of the banned specifiers — by
 * import, by dynamic import or by any other occurrence in their code. Files, not
 * specifiers, because "nothing in the browser entry reaches `msw/node`" is a
 * claim about modules and has to name the module that breaks it.
 */
function offenders(entry: string, banned: readonly string[], options: { readonly dynamic: boolean } = { dynamic: false }): string[] {
  const graph = reachable(entry, options);
  const guilty = graph.files.filter((file) => {
    const code = codeOf(file);
    const named = specifiersOf(file, { dynamic: true });
    return banned.some((needle) => named.some((specifier) => specifier.includes(needle)) || code.includes(needle));
  });
  return [...new Set(guilty.map(relative))].sort();
}

describe('module graph isolation', () => {
  it('keeps the package root free of msw/node, msw/browser and the filesystem', () => {
    expect(offenders('index.ts', ['msw/browser', 'msw/node', 'node:fs'])).toEqual([]);
  });

  it('keeps the node adapter out of the browser', () => {
    expect(offenders('node-adapter.ts', ['msw/browser'])).toEqual([]);
  });

  it('keeps the browser adapter out of node', () => {
    expect(offenders('browser-adapter.ts', ['msw/node', 'node:fs'])).toEqual([]);
  });

  it('routes the contract loader behind a single dynamic import', () => {
    // The root stays bundle-safe; only a caller that actually needs the on-disk
    // contracts (Node) pays for `node:fs`, and a browser app passes documents.
    const withDynamic = offenders('index.ts', ['node:fs'], { dynamic: true });
    expect(withDynamic).toEqual(['openapi-loader.ts']);
    expect(reachable('index.ts', { dynamic: true }).files.map(relative)).toContain('openapi-loader.ts');
    expect(reachable('index.ts').files.map(relative)).not.toContain('openapi-loader.ts');
    const handlersSource = readFileSync(join(sourceDirectory, 'handlers.ts'), 'utf8');
    expect(handlersSource).toMatch(/await import\(['"]\.\/openapi-loader\.js['"]\)/);
    expect(handlersSource).not.toMatch(/^import .*openapi-loader/m);
  });

  it('keeps the adapters in their own modules, reachable only from their entries', () => {
    const rootFiles = reachable('index.ts').files.map(relative);
    expect(rootFiles).not.toContain('node-adapter.ts');
    expect(rootFiles).not.toContain('browser-adapter.ts');
    expect(rootFiles).toEqual(
      expect.arrayContaining(['index.ts', 'handlers.ts', 'schemas.ts', 'types.ts', 'contract-behaviour.ts', 'openapi-document.ts']),
    );
    expect(reachable('node-adapter.ts').files.map(relative)).toContain('openapi-loader.ts');
    expect(reachable('browser-adapter.ts').files.map(relative)).not.toContain('openapi-loader.ts');
  });

  it('ships every entry point package.json advertises', () => {
    const manifestPath = join(sourceDirectory, '..', 'package.json');
    const manifest: { exports: Record<string, unknown> } = JSON.parse(readFileSync(manifestPath, 'utf8')) as { exports: Record<string, unknown> };
    expect(Object.keys(manifest.exports)).toEqual(expect.arrayContaining(['.', './server', './browser', './testing', './openapi/*', './generated/*']));
    for (const entry of ['index.ts', 'node-adapter.ts', 'browser-adapter.ts', join('testing', 'openapi-assert.ts'), join('testing', 'index.ts')]) {
      expect(existsSync(join(sourceDirectory, entry)), entry).toBe(true);
    }
  });

  it('has no hand-written per-endpoint handler anywhere in the package', () => {
    const scanned = readdirSync(sourceDirectory, { recursive: true })
      .map((entry) => String(entry))
      .filter((name) => name.endsWith('.ts'));
    expect(scanned.length).toBeGreaterThan(0);
    for (const name of scanned) {
      // The code only: `src/handlers.ts` documents that it contains no
      // `http.get(...)` and a scan over prose would read that as one.
      const code = codeOf(join(sourceDirectory, name));
      expect(code, `${name} would hand-write a mock`).not.toMatch(/\bhttp\s*\.\s*(get|post|put|patch|delete)\s*\(/);
      expect(code, `${name} would fabricate a fixture`).not.toMatch(/const (fixture|mock|sample)Data\b/i);
    }
  });
});
