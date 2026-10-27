/**
 * DESIGN.md parser: turns the raw document into the structured {@link DesignDocument}
 * model the harness consumes. Uses the front-matter splitter + the `yaml` package
 * directly (independent of the design.md linter).
 */
import { parse as parseYaml } from 'yaml';
import { splitFrontMatter } from './frontmatter.js';
import { partitionSections } from './sections.js';
import type { ComponentStyle, DesignDocument, DesignFrontmatter, TypographyStyle } from './types.js';

const KNOWN_KEYS = new Set(['version', 'name', 'description', 'colors', 'typography', 'rounded', 'spacing', 'components']);

function asStringRecord(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === null || v === undefined) continue;
      out[k] = typeof v === 'string' ? v : String(v);
    }
  }
  return out;
}

function asTypographyRecord(value: unknown): Record<string, TypographyStyle> {
  const out: Record<string, TypographyStyle> = {};
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const rec: Record<string, string | number | undefined> = {};
        for (const [pk, pv] of Object.entries(v as Record<string, unknown>)) {
          rec[pk] = pv === null || pv === undefined ? undefined : typeof pv === 'number' ? pv : String(pv);
        }
        out[k] = rec;
      } else {
        // Flat "font: value" shorthand — keep as a single-size style.
        out[k] = { fontSize: v === undefined ? undefined : String(v) };
      }
    }
  }
  return out;
}

function asComponentsRecord(value: unknown): Record<string, ComponentStyle> {
  const out: Record<string, ComponentStyle> = {};
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const rec: ComponentStyle = {};
        for (const [pk, pv] of Object.entries(v as Record<string, unknown>)) {
          if (pv === null || pv === undefined) continue;
          rec[pk] = typeof pv === 'number' ? pv : String(pv);
        }
        out[k] = rec;
      }
    }
  }
  return out;
}

/**
 * Parse a DESIGN.md document. Throws only on unrecoverable YAML syntax errors —
 * schema problems are the linter's job, not the parser's.
 */
export function parseDesignDocument(md: string): DesignDocument {
  const { frontMatter, body, present } = splitFrontMatter(md);
  let raw: Record<string, unknown> = {};
  if (present && frontMatter.trim().length > 0) {
    const parsed = parseYaml(frontMatter);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      raw = parsed as Record<string, unknown>;
    }
  }

  const unknownKeys = Object.keys(raw).filter((k) => !KNOWN_KEYS.has(k));

  const scalar = (key: string): string | undefined => {
    const v = raw[key];
    return v === undefined || v === null ? undefined : String(v);
  };

  const frontmatter: DesignFrontmatter = {
    version: scalar('version'),
    name: scalar('name'),
    description: scalar('description'),
    colors: asStringRecord(raw['colors']),
    typography: asTypographyRecord(raw['typography']),
    rounded: asStringRecord(raw['rounded']),
    spacing: asStringRecord(raw['spacing']),
    components: asComponentsRecord(raw['components']),
    unknownKeys,
  };

  return { frontmatter, body, sections: partitionSections(body) };
}
