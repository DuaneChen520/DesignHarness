/**
 * Tier 4 sensor — pixel-level visual regression across kernels (RESEARCH.md §7.1 sensor 3).
 *
 * Deliberately scoped to one baseline per component group plus the isolated modal and the
 * contract-backed table, rather than 100+ tiny section images: the tier exists to catch real
 * rendering drift, and RESEARCH.md puts it in the nightly/release gate precisely so that
 * sub-pixel antialiasing noise does not block daily PRs. Coverage of the whole matrix is
 * asserted by the a11y spec, which scans every section.
 *
 * Baselines are per-project (`{-projectName}` in the snapshot path template) because fonts are
 * rendered differently by each kernel; a shared baseline would be a false positive machine.
 */
import { expect, test } from '@playwright/test';
import { BASE_URL } from '../playwright.config.js';
import { assertFixtureCoverage, storySections } from './sensor-support.js';

const OPTIONS = { maxDiffPixelRatio: 0.01 } as const;

test.describe('@visual pixel regression', () => {
  test('each component group renders identically to its baseline', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForSelector('[data-section-id]');
    await page.evaluate(() => document.fonts.ready);

    const sections = await storySections(page);
    assertFixtureCoverage(sections);

    const components = [...new Set(sections.map((section) => section.component))].sort();
    for (const component of components) {
      const group = page.locator(`.showcase-group--${component}`);
      await expect(group, `component group ${component} did not render`).toBeVisible();
      await group.scrollIntoViewIfNeeded();
      await expect(group).toHaveScreenshot(`group-${component}.png`, OPTIONS);
    }
  });

  test('the modal dialog renders as the design system ships it', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    const sections = await storySections(page);
    const dialog = sections.find((section) => section.component === 'dialog' && /open/i.test(section.storyId));
    test.skip(dialog === undefined, 'no open Dialog story is declared');

    await page.goto(`${BASE_URL}/story?story=${encodeURIComponent(String(dialog?.storyId))}&mode=light`);
    await expect(page.locator('[data-part="content"]').first()).toBeVisible();
    await expect(page.locator('[data-part="positioner"]').first()).toHaveScreenshot('dialog-modal.png', OPTIONS);
  });

  test('the token cascade is part of the picture: dark and high contrast baselines', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    const sections = await storySections(page);
    const button = sections.find((section) => section.component === 'button');
    test.skip(button === undefined, 'no Button story is declared');

    // One story, three modes: addressing by story + mode is what makes the cascade the
    // variable under test instead of a different story per image.
    for (const mode of ['light', 'dark', 'high-contrast'] as const) {
      const section = page.locator(`[data-story-id="${String(button?.storyId)}"][data-mode="${mode}"]`);
      await expect(section).toHaveCount(1);
      await section.scrollIntoViewIfNeeded();
      await expect(section).toHaveScreenshot(`button-${mode}.png`, OPTIONS);
    }
  });

  test('prefers-reduced-motion neutralises transform animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${BASE_URL}/`);
    await page.waitForSelector('[data-section-id]');

    const measured = await page.locator('[data-part="root"][data-scope="button"]').first().evaluate((node) => {
      const computed = getComputedStyle(node);
      return {
        transitionDuration: computed.transitionDuration,
        transitionProperty: computed.transitionProperty,
        animationDuration: computed.animationDuration,
      };
    });

    // DESIGN.md §Do's and Don'ts: motion degrades to an instant opacity change, not a
    // removal of feedback — so duration must collapse to 0s while opacity may remain.
    expect(measured.transitionDuration, `reduced motion still animates: ${JSON.stringify(measured)}`).toMatch(/^(?:0s|0ms)$/);
    expect(measured.animationDuration).toMatch(/^(?:0s|0ms)$/);
  });

  test('no transform-based animation is applied at all under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${BASE_URL}/`);
    await page.waitForSelector('[data-section-id]');

    const offenders = await page.evaluate(() => {
      const bad: string[] = [];
      for (const element of Array.from(document.querySelectorAll('[data-part]'))) {
        const computed = getComputedStyle(element);
        const properties = computed.transitionProperty.split(',');
        const animatingTransform =
          computed.transitionDuration !== '0s' &&
          properties.some((property) => /transform|scale|translate|all/i.test(property.trim()));
        if (animatingTransform) {
          bad.push(`${element.getAttribute('data-scope')}/${element.getAttribute('data-part')} → ${computed.transitionProperty} ${computed.transitionDuration}`);
        }
      }
      return bad;
    });

    expect(offenders, `elements still transition transform under reduced motion:\n${offenders.join('\n')}`).toEqual([]);
  });
});
