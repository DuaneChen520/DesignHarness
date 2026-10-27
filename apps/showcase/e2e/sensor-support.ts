/**
 * Shared sensor plumbing for the showcase specs.
 *
 * Kept separate so each spec stays readable and so the two things that must never drift —
 * the axe option set and the way a failure is serialised — exist in exactly one place.
 */
import type { AxeResults } from 'axe-core';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

import { WCAG_22_ONLY_RULE, WCAG_22_TAG_SET } from '../src/a11y-options';

/** The gallery's fixture unit, read back out of the DOM rather than assumed. */
export interface SectionRef {
  readonly sectionId: string;
  readonly storyId: string;
  readonly component: string;
  readonly mode: string;
}

export const SECTION_SELECTOR = '[data-section-id][data-story-id][data-mode]';

/** Components the harness ships (TOKEN-API.md §6) and the modes the artifact cascades (§3). */
export const EXPECTED_COMPONENT_IDS = ['button', 'combobox', 'data-table', 'dialog', 'input'];
export const EXPECTED_MODES = ['dark', 'high-contrast', 'light'];

export async function storySections(page: Page): Promise<SectionRef[]> {
  return page.$$eval(SECTION_SELECTOR, (elements) =>
    elements.map((element) => ({
      sectionId: element.getAttribute('data-section-id') ?? '',
      storyId: element.getAttribute('data-story-id') ?? '',
      component: element.getAttribute('data-component') ?? '',
      mode: element.getAttribute('data-mode') ?? '',
    })),
  );
}

/**
 * A sensor that scanned nothing is worse than no sensor: coverage is asserted before the
 * results are read, so an empty gallery or a half-rendered one fails here rather than
 * reporting a green run.
 */
export function assertFixtureCoverage(sections: readonly SectionRef[]): void {
  expect(sections.length, 'the gallery rendered no story sections at all').toBeGreaterThan(0);

  const components = [...new Set(sections.map((section) => section.component))].sort();
  expect(components, 'the gallery does not cover every shipped component').toEqual(EXPECTED_COMPONENT_IDS);

  const modes = [...new Set(sections.map((section) => section.mode))].sort();
  expect(modes, 'the gallery does not render every token mode').toEqual(EXPECTED_MODES);

  const stories = [...new Set(sections.map((section) => section.storyId))];
  expect(stories.length, 'no CSF stories were registered').toBeGreaterThan(0);

  const incompleteStories = stories.filter(
    (storyId) => sections.filter((section) => section.storyId === storyId).length !== EXPECTED_MODES.length,
  );
  expect(incompleteStories, 'these stories are not rendered in every mode').toEqual([]);
}

/** Every rule id axe actually evaluated in this run, across all four result buckets. */
export function scannedRuleIds(results: AxeResults): string[] {
  return [...results.violations, ...results.passes, ...results.incomplete, ...results.inapplicable]
    .map((result) => result.id)
    .sort();
}

/** Rule id + impact + target selectors + failureSummary, the four things a fixer needs. */
export function describeViolations(results: AxeResults): string {
  if (results.violations.length === 0) {
    return 'no violations';
  }
  return results.violations
    .map((violation) => {
      const nodes = violation.nodes
        .map((node) => `        target: ${JSON.stringify(node.target)}\n        ${node.html}\n        ${node.failureSummary ?? ''}`)
        .join('\n');
      return `      - ${violation.id} (impact: ${violation.impact ?? 'unknown'}) tags: ${violation.tags.join(', ')}\n        help: ${violation.help}\n${nodes}`;
    })
    .join('\n');
}

export interface ScanOptions {
  readonly page: Page;
  /** What the run is called in the failure message and the printed summary. */
  readonly label: string;
  /** Restrict the scan to one region (an `include`, never an `exclude`). */
  readonly scope?: string;
  /** Extra axe options, e.g. an `only` for an interactive state. */
  readonly before?: (builder: AxeBuilder) => AxeBuilder;
}

/**
 * Run the WCAG 2.2 AA scan and assert the gate.
 *
 * Order matters and is deliberate: prove the WCAG 2.2-only rule was in the run *first*, so a
 * tag-list regression fails as "the sensor did not measure SC 2.5.8" instead of a misleading
 * zero violations; then assert the violations are empty, with the serialised report attached.
 */
export async function scanAndAssert(options: ScanOptions): Promise<AxeResults> {
  const { page, label, scope, before } = options;

  let builder = new AxeBuilder({ page }).withTags([...WCAG_22_TAG_SET]);
  if (scope !== undefined) {
    builder = builder.include(scope);
  }
  if (before !== undefined) {
    builder = before(builder);
  }

  const results = await builder.analyze();
  const ruleIds = scannedRuleIds(results);

  expect(
    ruleIds.includes(WCAG_22_ONLY_RULE),
    `${label}: axe evaluated ${String(ruleIds.length)} rules but none of them is the WCAG 2.2-only ` +
      `"${WCAG_22_ONLY_RULE}" (SC 2.5.8). The tag set ${WCAG_22_TAG_SET.join(', ')} did not take effect, ` +
      `so this run cannot certify WCAG 2.2.`,
  ).toBe(true);

  expect(
    results.violations.length,
    `${label}: ${String(results.violations.length)} WCAG 2.2 AA violation(s) over ${String(ruleIds.length)} scanned rules.\n` +
      describeViolations(results),
  ).toBe(0);
  expect(results.violations).toEqual([]);

  console.log(
    `[a11y] ${label}: violations=0 passes=${String(results.passes.length)} ` +
      `incomplete=${String(results.incomplete.length)} inapplicable=${String(results.inapplicable.length)} ` +
      `rules=${String(ruleIds.length)} (incl. ${WCAG_22_ONLY_RULE})`,
  );

  return results;
}
