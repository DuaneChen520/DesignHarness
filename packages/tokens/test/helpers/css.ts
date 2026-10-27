/**
 * Tiny CSS reader for the contract tests. The generated output is flat (one custom
 * property per line, no nesting beyond the `@media` wrapper), so a brace-matching scan
 * is enough — and it keeps the suite free of a CSS parser dependency.
 */

/** `--name -> value` for every declaration in a stylesheet, last one winning. */
export function declarations(css: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const match of stripComments(css).matchAll(/(--[A-Za-z0-9_-]+)\s*:\s*([^;{}]+);/g)) {
    const name = match[1];
    const value = match[2];
    if (name !== undefined && value !== undefined) out.set(name, value.trim());
  }
  return out;
}

/** The custom property names a stylesheet defines, de-duplicated, source order. */
export function customPropertyNames(css: string): string[] {
  return [...new Set([...declarations(css).keys()])];
}

/** The same names without the `--` prefix (the artifact's public name form). */
export function publicTokenNames(css: string): string[] {
  return customPropertyNames(css).map((name) => name.slice(2));
}

/** Remove `/* … *​/` comments so they cannot satisfy an inclusion assertion. */
export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * The body of the first rule whose selector contains `selectorText`.
 *
 * Brace depth is tracked so `@media (prefers-color-scheme: dark) { :root:not(...) { …
 * } }` resolves to the inner block instead of swallowing the whole at-rule.
 */
export function ruleBody(css: string, selectorText: string): string | null {
  const source = stripComments(css);
  const at = source.indexOf(selectorText);
  if (at < 0) return null;
  const open = source.indexOf('{', at + selectorText.length);
  if (open < 0) return null;
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  return null;
}

/** Custom properties declared directly inside a selector's block. */
export function propertiesInRule(css: string, selectorText: string): string[] {
  const body = ruleBody(css, selectorText);
  return body === null ? [] : customPropertyNames(body);
}

/** Public (un-prefixed) names declared inside a selector's block. */
export function publicNamesInRule(css: string, selectorText: string): string[] {
  return propertiesInRule(css, selectorText).map((name) => name.slice(2));
}

/** Names a rule redefines with a value that differs from `baseline`. */
export function redefinedNames(css: string, selectorText: string, baseline: Map<string, string>): string[] {
  const body = ruleBody(css, selectorText);
  if (body === null) return [];
  const inner = declarations(body);
  return [...inner.entries()]
    .filter(([name, value]) => baseline.has(name) && baseline.get(name) !== value)
    .map(([name]) => name);
}
