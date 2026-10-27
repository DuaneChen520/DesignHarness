/**
 * Canonical DESIGN.md section model.
 *
 * The DESIGN.md spec fixes an 8-section order:
 *   Overview → Colors → Typography → Layout → Elevation & Depth → Shapes →
 *   Components → Do's and Don'ts
 *
 * The official linter's `missing-sections` rule already enforces presence; this
 * module additionally gives the harness an independent partition + order validator
 * so we can report *out-of-order* drift the linter is lenient about.
 */
import type { DocumentSection, SectionOrderIssue } from './types.js';

/** The canonical, ordered set of top-level DESIGN.md sections. */
export const CANONICAL_SECTIONS: readonly string[] = [
  'Overview',
  'Colors',
  'Typography',
  'Layout',
  'Elevation & Depth',
  'Shapes',
  'Components',
  "Do's and Don'ts",
];

function normalize(heading: string): string {
  return heading.replace(/\s+/g, ' ').trim();
}

/**
 * Partition a markdown body into `##`-level sections. Deeper headings (`###`+) are
 * folded into their parent section's content. A `#` H1 title, if present, is
 * ignored (the DESIGN.md spec treats the front-matter `name` as the title).
 */
export function partitionSections(body: string): DocumentSection[] {
  const lines = body.replace(/^\uFEFF/, '').split(/\r?\n/);
  const sections: DocumentSection[] = [];
  let current: { heading: string; buf: string[] } | null = null;

  const flush = (): void => {
    if (current) {
      sections.push({ heading: current.heading, content: current.buf.join('\n').trim() });
      current = null;
    }
  };

  for (const line of lines) {
    const h2 = /^##(?!#)\s+(.+?)\s*#*\s*$/.exec(line);
    const h1 = /^#(?!#)\s+(.+?)\s*#*\s*$/.exec(line);
    if (h2?.[1] !== undefined) {
      flush();
      current = { heading: normalize(h2[1]), buf: [] };
    } else if (h1) {
      // An H1 ends any open section (title-like; not itself a section).
      flush();
    } else if (current) {
      current.buf.push(line);
    }
  }
  flush();
  return sections;
}

/**
 * Validate that the document's `##` headings appear in canonical order. Extra
 * (non-canonical) headings are reported as `unknown-section`; a canonical heading
 * appearing after a later canonical heading is reported as `out-of-order`.
 */
export function validateSectionOrder(sections: DocumentSection[]): SectionOrderIssue[] {
  const issues: SectionOrderIssue[] = [];
  let maxCanonicalIndex = -1;
  for (const section of sections) {
    const canonicalIndex = CANONICAL_SECTIONS.indexOf(section.heading);
    if (canonicalIndex === -1) {
      issues.push({
        kind: 'unknown-section',
        heading: section.heading,
        message: `Section "${section.heading}" is not one of the canonical DESIGN.md sections.`,
      });
      continue;
    }
    if (canonicalIndex < maxCanonicalIndex) {
      const expected = CANONICAL_SECTIONS[maxCanonicalIndex] ?? '';
      issues.push({
        kind: 'out-of-order',
        heading: section.heading,
        message: `Section "${section.heading}" appears after "${expected}" — canonical order is: ${CANONICAL_SECTIONS.join(' → ')}.`,
      });
    } else {
      maxCanonicalIndex = Math.max(maxCanonicalIndex, canonicalIndex);
    }
  }
  return issues;
}
