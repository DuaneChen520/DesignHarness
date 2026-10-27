/**
 * The axe option set the Tier-3 gate runs, in one place, so it can be proved twice:
 *
 * 1. `test/a11y-options.test.ts` asserts against the bundled axe-core that `wcag22aa` is
 *    the tag that turns SC 2.5.8 (`target-size`) on — i.e. that the fifth tag in this list
 *    is load-bearing and not decoration (RESEARCH.md §7.1 "避坑配置").
 * 2. `e2e/a11y.spec.ts` runs with exactly these tags in a real browser and asserts the
 *    scanned rule set actually contained `target-size` before it asserts zero violations.
 */
export const WCAG_22_TAG_SET: readonly string[] = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** A rule that only exists in WCAG 2.2: SC 2.5.8 Target Size (Minimum). */
export const WCAG_22_ONLY_RULE = 'target-size';
