/**
 * Proves the WCAG 2.2 tag is load-bearing rather than decorative.
 *
 * RESEARCH.md §7.1 calls this out as the single configuration trap of the a11y sensor:
 * axe-core ships SC 2.5.8 (`target-size`) with `enabled: false` and tags it `wcag22aa`, so a
 * suite that asks for `wcag2a/wcag2aa/wcag21a/wcag21aa` never sees it. This test asks the
 * bundled axe-core itself which rules each tag set selects — no browser, no page, and no way
 * for a fixture to hide the answer.
 */
import axe from 'axe-core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { WCAG_22_ONLY_RULE, WCAG_22_TAG_SET } from '../src/a11y-options.js';

const rulesFor = (tags: readonly string[]): { ruleId: string; tags: string[]; enabled: boolean }[] =>
  axe.getRules([...tags]).map((rule) => ({ ruleId: rule.ruleId, tags: [...rule.tags], enabled: rule.enabled }));

const idsFor = (tags: readonly string[]): string[] => rulesFor(tags).map((rule) => rule.ruleId).sort();

describe('a11y sensor configuration', () => {
  it('asks axe for exactly the five tag set RESEARCH.md §7.1 mandates', () => {
    expect(WCAG_22_TAG_SET).toEqual(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
  });

  it('selects a WCAG 2.2-only rule only because of the wcag22aa tag', () => {
    const without22 = idsFor(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
    const with22 = idsFor(WCAG_22_TAG_SET);

    expect(with22).toContain(WCAG_22_ONLY_RULE);
    expect(without22).not.toContain(WCAG_22_ONLY_RULE);
    expect(with22.length).toBeGreaterThan(without22.length);
  });

  it('proves the rule is disabled in the shipped audit, so a default run would never apply it', () => {
    const targetSize = rulesFor(WCAG_22_TAG_SET).find((rule) => rule.ruleId === WCAG_22_ONLY_RULE);

    expect(targetSize).toBeDefined();
    expect(targetSize?.tags).toContain('wcag22aa');
    expect(targetSize?.enabled).toBe(false);
  });

  it('keeps experimental axe rules out of the requested set', () => {
    // `td-has-header` carries wcag2a but is experimental, and axe's default `tagExclude`
    // removes it. If that ever changed, the gate would start failing on rules the design
    // system never agreed to be measured by, so the expectation is written down.
    const experimental = rulesFor(WCAG_22_TAG_SET).filter((rule) => rule.tags.includes('experimental'));
    expect(experimental.every((rule) => rule.enabled === false)).toBe(true);
  });

  it('is the tag set the browser spec actually hands to withTags', () => {
    // Vitest rewrites `import.meta.url` to a served http URL, so the files are located from the
    // package working directory rather than through file-URL resolution.
    const spec = readFileSync(join(process.cwd(), 'e2e', 'a11y.spec.ts'), 'utf8');
    const support = readFileSync(join(process.cwd(), 'e2e', 'sensor-support.ts'), 'utf8');

    // The tag set is defined once and consumed once — in the scanner the specs share.
    expect(support).toMatch(/new AxeBuilder\(\{ page \}\)\s*\.withTags\(\[\.\.\.WCAG_22_TAG_SET\]\)/);
    expect(support).toContain("import { WCAG_22_ONLY_RULE, WCAG_22_TAG_SET } from '../src/a11y-options'");
    expect(spec).toContain('scanAndAssert');
    expect(spec).toMatch(/from ['"]\.\/sensor-support/);
    // A gate that switches rules off is not a gate.
    for (const file of [spec, support]) {
      expect(file).not.toMatch(/disableRules|excludeGlobalA11yHooks|addAxeRules|\.exclude\(|rules:\s*\{/);
    }
  });
});
