/**
 * Reads values back OUT of a DTCG artifact, following `{a.b.c}` alias chains, and
 * converts the `oklch(...)` colour strings to concrete sRGB triples. The gates and
 * the tokens tests use this to assert contrast on the *compiled artifact*, never on
 * hand-typed values.
 */
import { hexToRgb, mapOklchToSrgbGamut, parseOklch } from '../colors/convert.js';
import type { Rgb } from '../colors/primitives.js';
import type { DtcgGroup, DtcgToken } from './types.js';

const ALIAS_RE = /^\{([^}]+)\}$/;

/** Is this group-node value a leaf token (has `$value`)? */
function isToken(node: unknown): node is DtcgToken {
  return typeof node === 'object' && node !== null && '$value' in (node as Record<string, unknown>);
}

function childOf(node: unknown, key: string): unknown {
  if (typeof node === 'object' && node !== null) return (node as DtcgGroup)[key];
  return undefined;
}

/** Walk a dotted path (`"color.semantic.primary"`) to its artifact node. */
export function getNodeAtPath(artifact: unknown, dottedPath: string): unknown {
  let node: unknown = artifact;
  for (const seg of dottedPath.split('.')) {
    node = childOf(node, seg);
    if (node === undefined) return undefined;
  }
  return node;
}

/**
 * Resolve a `$value` (which may be an alias string) to its terminal value,
 * following alias chains. Throws on a broken alias or cycle to surface artifact bugs
 * loudly at the boundary.
 */
export function resolveValue(artifact: unknown, dottedPath: string, seen: Set<string> = new Set()): unknown {
  const node = getNodeAtPath(artifact, dottedPath);
  if (node === undefined) throw new Error(`Broken alias: "${dottedPath}" not found in artifact`);
  if (!isToken(node)) throw new Error(`Path "${dottedPath}" is not a token`);
  const raw = node.$value;
  if (typeof raw === 'string') {
    const m = ALIAS_RE.exec(raw.trim());
    if (m?.[1]) {
      if (seen.has(m[1])) throw new Error(`Cyclic alias at "${dottedPath}" → "${m[1]}"`);
      return resolveValue(artifact, m[1], new Set(seen).add(dottedPath));
    }
  }
  return raw;
}

/** Resolve a token path to its terminal colour and convert to sRGB (0–255). */
export function resolveColorToRgb(artifact: unknown, dottedPath: string): Rgb {
  const value = resolveValue(artifact, dottedPath);
  if (typeof value !== 'string') {
    throw new Error(`Token "${dottedPath}" did not resolve to a colour string`);
  }
  if (value.trim().startsWith('#')) return hexToRgb(value);
  const { oklch } = parseOklch(value);
  return mapOklchToSrgbGamut(oklch);
}

/** Flatten every leaf token into `{ "a.b.c": $value }` (aliases NOT resolved). */
export function flattenRaw(artifact: unknown, prefix: readonly string[] = [], out: Map<string, unknown> = new Map()): Map<string, unknown> {
  if (typeof artifact !== 'object' || artifact === null) return out;
  for (const [key, child] of Object.entries(artifact as DtcgGroup)) {
    if (key.startsWith('$')) continue;
    const path = [...prefix, key];
    if (isToken(child)) {
      out.set(path.join('.'), child.$value);
    } else if (typeof child === 'object' && child !== null) {
      flattenRaw(child, path, out);
    }
  }
  return out;
}
