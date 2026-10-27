/**
 * Tier 3 sensor — WCAG 2.2 AA zero-violation gate over the real component matrix.
 *
 * The fixture unit is "one CSF story in one token mode"; the gallery mounts all of them at
 * once, so this spec never picks and chooses what to look at: it enumerates the sections out
 * of the DOM, proves coverage first (every shipped component, every shipped mode, every story
 * in every mode), then runs axe-core with the WCAG 2.2 tag set — including `wcag22aa`, which
 * is what switches SC 2.5.8 `target-size` on at all (RESEARCH.md §7.1).
 *
 * A run that scanned nothing, or scanned without the 2.2 tag, fails here.
 */
import { expect, test, type Page } from '@playwright/test';
import { BASE_URL } from '../playwright.config.js';
import { assertFixtureCoverage, scanAndAssert, storySections, type SectionRef } from './sensor-support.js';

async function gallery(page: Page): Promise<SectionRef[]> {
  await page.goto(`${BASE_URL}/`);
  await page.waitForSelector('[data-section-id]');
  await page.evaluate(() => document.fonts.ready);
  const sections = await storySections(page);
  assertFixtureCoverage(sections);
  return sections;
}

test.describe('@a11y WCAG 2.2 AA gate', () => {
  test('the gallery exposes the full story × mode fixture matrix', async ({ page }) => {
    const sections = await gallery(page);
    console.log(`[a11y] fixture matrix: ${String(sections.length)} sections across ${String(new Set(sections.map((s) => s.component)).size)} components`);
  });

  test('every story in every token mode is violation-free', async ({ page }) => {
    const sections = await gallery(page);

    // One scan of the whole matrix: a per-section scan would miss cross-section issues
    // (duplicate ids, landmark structure, heading order) which are part of AA.
    await scanAndAssert({ page, label: `gallery matrix (${String(sections.length)} sections)` });

    // Each mode must also be individually clean: a cascade regression in one mode would
    // otherwise be masked by two passing modes in the aggregate result.
    for (const mode of [...new Set(sections.map((section) => section.mode))].sort()) {
      await scanAndAssert({ page, label: `mode=${mode}`, scope: `[data-mode="${mode}"]` });
    }
  });

  test('interactive states are violation-free while open', async ({ page }) => {
    const sections = await gallery(page);

    const combobox = sections.find((section) => section.component === 'combobox' && /open/i.test(section.storyId));
    expect(combobox, 'no open Combobox story is mounted').toBeDefined();

    // The gallery deliberately mounts dialogs non-modally (a modal would aria-hide the other
    // 104 sections); the modal contract is scanned on its own route in the next test.
    const trigger = page.locator(`#${String(combobox?.sectionId)} [data-part="trigger"]`).first();
    const content = page.locator(`#${String(combobox?.sectionId)} [data-part="content"]`);
    if ((await trigger.getAttribute('aria-expanded')) !== 'true' || !(await content.isVisible())) {
      await trigger.click();
    }
    await expect(content).toBeVisible();

    await scanAndAssert({
      page,
      label: `open combobox (${String(combobox?.storyId)})`,
      scope: `#${String(combobox?.sectionId)}`,
    });

    const table = sections.find((section) => section.component === 'data-table');
    await scanAndAssert({ page, label: 'data-table section', scope: `#${String(table?.sectionId)}` });

    const dialogSection = sections.find((section) => section.component === 'dialog');
    await scanAndAssert({ page, label: 'dialog section', scope: `#${String(dialogSection?.sectionId)}` });
  });

  test('the modal dialog contract is violation-free on its own route', async ({ page }) => {
    const sections = await gallery(page);
    const dialogStory = sections.find((section) => section.component === 'dialog' && /open/i.test(section.storyId));
    expect(dialogStory, 'no open Dialog story is declared in the CSF modules').toBeDefined();

    await page.goto(`${BASE_URL}/story?story=${encodeURIComponent(String(dialogStory?.storyId))}&mode=light`);
    const content = page.locator('[data-part="content"]').first();
    await expect(content).toBeVisible();
    await expect(content).toHaveAttribute('role', 'dialog');
    await scanAndAssert({ page, label: `isolated modal story ${String(dialogStory?.storyId)}` });
  });

  test('the dark and high-contrast cascades are violation-free on the page shell too', async ({ page }) => {
    await gallery(page);
    for (const theme of ['dark', 'high-contrast']) {
      await page.locator('[data-role="theme-select"]').selectOption(theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      // Only the chrome: the gallery sections pin their own mode and are scanned above.
      await scanAndAssert({ page, label: `page chrome in ${theme}`, scope: '.showcase__header' });
    }
  });
});
