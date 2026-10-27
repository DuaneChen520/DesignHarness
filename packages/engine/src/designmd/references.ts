/**
 * `{colors.x}` / `{typography.x}` / `{rounded.x}` / `{spacing.x}` reference
 * resolution over the DESIGN.md front matter.
 *
 * The linter resolves references too, but the harness needs its own pass to (a)
 * surface broken references as structured data and (b) build the flat symbol table
 * that DTCG synthesis aliases against.
 */
import type { DesignFrontmatter, ReferenceResolution, TokenReference, BrokenReference } from './types.js';

const REF_RE = /^\{([^}]+)\}$/;

/** Parse a raw `"{group.key}"` string into its parts, or `null` if it is not a reference. */
export function parseReference(raw: string): { group: string; key: string } | null {
  const m = REF_RE.exec(raw.trim());
  if (!m?.[1]) return null;
  const dot = m[1].indexOf('.');
  if (dot <= 0) return null;
  return { group: m[1].slice(0, dot), key: m[1].slice(dot + 1) };
}

/** Flat symbol table: `"colors.primary"` → authored value. */
export function buildSymbolTable(fm: DesignFrontmatter): Map<string, unknown> {
  const table = new Map<string, unknown>();
  for (const [k, v] of Object.entries(fm.colors)) table.set(`colors.${k}`, v);
  for (const [k, v] of Object.entries(fm.typography)) table.set(`typography.${k}`, v);
  for (const [k, v] of Object.entries(fm.rounded)) table.set(`rounded.${k}`, v);
  for (const [k, v] of Object.entries(fm.spacing)) table.set(`spacing.${k}`, v);
  return table;
}

function resolveValue(
  table: Map<string, unknown>,
  value: string | number,
  seen: Set<string>,
): { ok: boolean; value?: string | number; path?: string } {
  if (typeof value === 'number') return { ok: true, value };
  const ref = parseReference(value);
  if (!ref) return { ok: true, value };
  const path = `${ref.group}.${ref.key}`;
  if (seen.has(path)) return { ok: false, path }; // cycle
  const raw = table.get(path);
  if (raw === undefined) return { ok: false, path };
  if (typeof raw === 'string' || typeof raw === 'number') {
    return resolveValue(table, raw, new Set(seen).add(path));
  }
  // Object target (e.g. a whole typography style) — resolvable, keep marker.
  return { ok: true, value: path };
}

/** Resolve every component reference in the front matter. */
export function resolveReferences(fm: DesignFrontmatter): ReferenceResolution {
  const table = buildSymbolTable(fm);
  const references: TokenReference[] = [];
  const broken: BrokenReference[] = [];
  const resolved = new Map<string, string | number>();

  for (const [componentName, style] of Object.entries(fm.components)) {
    for (const [propName, raw] of Object.entries(style)) {
      const ref = parseReference(String(raw));
      if (!ref) continue;
      const owner = `components.${componentName}.${propName}`;
      const reference: TokenReference = { owner, raw: String(raw), group: ref.group, key: ref.key };
      references.push(reference);
      const result = resolveValue(table, String(raw), new Set<string>());
      if (result.ok) {
        resolved.set(owner, result.value as string | number);
      } else {
        const reason =
          result.path && [...table.keys()].join(',').includes(result.path)
            ? 'Circular or self-referential alias.'
            : `No "${ref.group}.${ref.key}" token is defined in the front matter.`;
        broken.push({ ...reference, reason });
      }
    }
  }

  return { references, broken, resolved };
}
