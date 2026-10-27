import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CANONICAL_SECTIONS,
  lintIntent,
  parseDesignDocument,
  partitionSections,
  resolveReferences,
  validateSectionOrder,
} from '../src/index.js';

const DESIGN_MD = fileURLToPath(new URL('../../../DESIGN.md', import.meta.url));
const hx = (h: string): string => `#${h}`;

describe('parseDesignDocument', () => {
  it('reads front matter colours, typography, spacing, rounded, components', () => {
    const md = `---
name: Test
colors:
  primary: "${hx('1A5FD0')}"
typography:
  body-md:
    fontFamily: Inter
    fontSize: 1rem
rounded:
  md: 8px
spacing:
  md: 16px
components:
  button:
    backgroundColor: "{colors.primary}"
---

## Overview

Hi.
`;
    const doc = parseDesignDocument(md);
    expect(doc.frontmatter.name).toBe('Test');
    expect(doc.frontmatter.colors['primary']).toBe(hx('1A5FD0'));
    expect(doc.frontmatter.typography['body-md']?.['fontFamily']).toBe('Inter');
    expect(doc.frontmatter.spacing['md']).toBe('16px');
    expect(doc.frontmatter.components['button']?.['backgroundColor']).toBe('{colors.primary}');
  });

  it('parses the real DESIGN.md (Intent SSOT)', async () => {
    const { readFile } = await import('node:fs/promises');
    const doc = parseDesignDocument(await readFile(DESIGN_MD, 'utf8'));
    expect(doc.frontmatter.colors['primary']).toBe(hx('1A5FD0'));
    expect(Object.keys(doc.frontmatter.colors).length).toBeGreaterThanOrEqual(40);
    expect(doc.frontmatter.typography['body-md']).toBeDefined();
    expect(doc.frontmatter.unknownKeys).toEqual([]);
  });
});

describe('reference resolution', () => {
  it('resolves valid {colors.x} references', () => {
    const doc = parseDesignDocument(`---
colors:
  primary: "${hx('1A5FD0')}"
components:
  button:
    backgroundColor: "{colors.primary}"
---
`);
    const resolution = resolveReferences(doc.frontmatter);
    expect(resolution.references).toHaveLength(1);
    expect(resolution.broken).toHaveLength(0);
    expect(resolution.resolved.get('components.button.backgroundColor')).toBe(hx('1A5FD0'));
  });

  it('detects broken references', () => {
    const doc = parseDesignDocument(`---
colors:
  primary: "${hx('1A5FD0')}"
components:
  button:
    backgroundColor: "{colors.does-not-exist}"
---
`);
    const resolution = resolveReferences(doc.frontmatter);
    expect(resolution.broken).toHaveLength(1);
    expect(resolution.broken[0]?.key).toBe('does-not-exist');
    expect(resolution.broken[0]?.reason).toMatch(/No .* token/);
  });

  it('detects a reference into an undefined group', () => {
    const doc = parseDesignDocument(`---
components:
  thing:
    style: "{typography.ghost}"
---
`);
    const resolution = resolveReferences(doc.frontmatter);
    expect(resolution.broken[0]?.group).toBe('typography');
  });
});

describe('section order validation', () => {
  it('accepts the canonical order in DESIGN.md', async () => {
    const { readFile } = await import('node:fs/promises');
    const doc = parseDesignDocument(await readFile(DESIGN_MD, 'utf8'));
    const headings = doc.sections.map((s) => s.heading);
    // Every canonical section must be present.
    for (const canonical of CANONICAL_SECTIONS) {
      expect(headings).toContain(canonical);
    }
    expect(validateSectionOrder(doc.sections)).toEqual([]);
  });

  it('flags out-of-order canonical sections', () => {
    const sections = partitionSections('## Colors\nx\n## Overview\ny\n');
    const issues = validateSectionOrder(sections);
    expect(issues.some((i) => i.kind === 'out-of-order')).toBe(true);
  });

  it('flags unknown sections', () => {
    const sections = partitionSections('## Overview\nx\n## Widgets\ny\n');
    const issues = validateSectionOrder(sections);
    expect(issues.some((i) => i.kind === 'unknown-section' && i.heading === 'Widgets')).toBe(true);
  });
});

describe('lintIntent (official @google/design.md linter)', () => {
  it('reports ZERO errors for the real DESIGN.md (Tier-2 gate)', async () => {
    const result = await lintIntent(DESIGN_MD);
    expect(result.errors).toBe(0);
    expect(Array.isArray(result.findings)).toBe(true);
    expect(result.findings.every((f) => f.severity !== 'error')).toBe(true);
  });
});
