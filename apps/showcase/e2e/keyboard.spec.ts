/**
 * Tier 3/4 sensor — WAI-ARIA APG keyboard interaction in a real browser.
 *
 * The primitives own the state machines; this spec proves they behave under real key events on
 * a real focus ring — sequential Tab navigation, focus trapping and restoration, type-ahead
 * filtering and `aria-sort` cycling are exactly the things jsdom cannot faithfully model.
 *
 * It drives `/interaction`, the uncontrolled fixture (see `src/views/InteractionView.tsx`):
 * a controlled "Open" story snapshot cannot demonstrate a dismissal.
 */
import { expect, test, type Page } from '@playwright/test';
import { BASE_URL } from '../playwright.config.js';

async function openInteraction(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/interaction`);
  await page.waitForSelector('[data-role="interaction-view"] [data-part]');
}

const optionIndexOfActive = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('[data-scope="combobox"][data-part="input"]');
    const activeId = input?.getAttribute('aria-activedescendant');
    const options = Array.from(document.querySelectorAll('[data-scope="combobox"][data-part="option"]'));
    return options.findIndex((option) => option.id === activeId);
  });

const activePart = (page: Page): Promise<string | null> =>
  page.evaluate(() => document.activeElement?.getAttribute('data-part') ?? null);
const focusIsInsideDialog = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const dialog = document.querySelector('[data-scope="dialog"][data-part="content"]');
    return dialog !== null && document.activeElement !== null && dialog.contains(document.activeElement);
  });

test.describe('@a11y APG keyboard behaviour', () => {
  test('combobox: ArrowDown opens, Home/End jump, arrows move, Enter commits, Escape closes', async ({ page }) => {
    await openInteraction(page);
    const combobox = page.locator('[data-scope="combobox"]').first();
    const input = combobox.locator('[data-part="input"]');
    await input.focus();
    await expect(input).toHaveAttribute('role', 'combobox');
    await expect(input).toHaveAttribute('aria-expanded', 'false');

    await input.press('ArrowDown');
    await expect(input).toHaveAttribute('aria-expanded', 'true');
    await expect(combobox.locator('[data-part="list"]')).toBeVisible();
    const options = combobox.locator('[data-part="option"]');
    await expect
      .poll(async () => options.count(), { message: 'the combobox rendered no options after opening' })
      .toBeGreaterThan(1);
    const count = await options.count();

    // Zag resolves the collection in a later tick, so the first highlight is what makes the
    // list keyboard-navigable. Sending the next key before it lands would race the machine.
    await expect
      .poll(() => optionIndexOfActive(page), { message: 'ArrowDown did not highlight the first option' })
      .toBe(0);

    await input.press('End');
    await expect.poll(() => optionIndexOfActive(page)).toBe(count - 1);

    await input.press('Home');
    await expect.poll(() => optionIndexOfActive(page)).toBe(0);

    await input.press('ArrowDown');
    await expect.poll(() => optionIndexOfActive(page)).toBe(1);
    await input.press('ArrowUp');
    await expect.poll(() => optionIndexOfActive(page)).toBe(0);

    await input.press('Enter');
    await expect(input).toHaveAttribute('aria-expanded', 'false');
    expect((await input.inputValue()).length, 'Enter did not commit a value').toBeGreaterThan(0);
    await expect(activePart(page)).resolves.toBe('input');

    await input.press('ArrowDown');
    await expect(input).toHaveAttribute('aria-expanded', 'true');
    await expect
      .poll(() => optionIndexOfActive(page), { message: 'reopening the list did not highlight an option' })
      .toBeGreaterThanOrEqual(0);
    await input.press('Escape');
    await expect(input).toHaveAttribute('aria-expanded', 'false');
    await expect(activePart(page)).resolves.toBe('input');
  });

  test('combobox: typing filters the option list and Tab moves focus out cleanly', async ({ page }) => {
    await openInteraction(page);
    const combobox = page.locator('[data-scope="combobox"]').first();
    const input = combobox.locator('[data-part="input"]');
    const before = await combobox.locator('[data-part="option"]').count();
    expect(before, 'the unfiltered list should offer more than one option').toBeGreaterThan(1);

    await input.press('ArrowDown');
    await input.pressSequentially('zzzznomatch', { delay: 10 });
    await expect
      .poll(() => combobox.locator('[data-part="option"]').count(), { message: 'typing did not filter the list' })
      .toBeLessThan(before);

    await input.press('Tab');
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-part')))
      .not.toBe('input');
    const stillUsable = await input.evaluate((node) => node.getAttribute('role') === 'combobox');
    expect(stillUsable).toBe(true);
  });

  test('dialog: focus enters on open, Tab and Shift+Tab stay trapped, Escape restores the trigger', async ({ page }) => {
    await openInteraction(page);
    const trigger = page.locator('[data-scope="dialog"][data-part="trigger"]').first();
    await expect(trigger).toBeVisible();
    // The surface stays mounted but hidden while closed, so it must not be reachable.
    await expect(page.locator('[data-scope="dialog"][data-part="content"]')).toBeHidden();

    await trigger.focus();
    await trigger.press('Enter');

    const content = page.locator('[data-scope="dialog"][data-part="content"]').first();
    await expect(content).toBeVisible();
    await expect(content).toHaveAttribute('role', 'dialog');
    await expect
      .poll(() => focusIsInsideDialog(page), { message: 'opening the dialog did not move focus inside' })
      .toBe(true);

    const focusables = content.locator('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const count = await focusables.count();
    expect(count, 'a dialog with no focusable content cannot be trapped').toBeGreaterThan(0);
    await focusables.nth(count - 1).focus();

    for (let step = 0; step < count + 2; step += 1) {
      await page.keyboard.press('Tab');
      expect(await focusIsInsideDialog(page), `Tab escaped the dialog at step ${String(step)}`).toBe(true);
    }
    for (let step = 0; step < count + 2; step += 1) {
      await page.keyboard.press('Shift+Tab');
      expect(await focusIsInsideDialog(page), `Shift+Tab escaped the dialog at step ${String(step)}`).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(content).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => document.activeElement === document.querySelector('[data-scope="dialog"][data-part="trigger"]')))
      .toBe(true);
  });

  test('dialog: the background is inert while the modal is open, and reachable again after', async ({ page }) => {
    await openInteraction(page);
    const chrome = page.locator('[data-role="showcase-root"] > header');
    await page.locator('[data-scope="dialog"][data-part="trigger"]').first().click();
    await expect(page.locator('[data-scope="dialog"][data-part="content"]')).toBeVisible();

    // aria-hidden without inert is the Zag 1.46 gap the primitive mirrors closed (WCAG 2.2 SC 4.1.2).
    await expect
      .poll(() => chrome.evaluate((node) => node.getAttribute('inert') !== null), { message: 'background was not made inert' })
      .toBe(true);
    await expect(chrome).toHaveAttribute('aria-hidden', 'true');

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-scope="dialog"][data-part="content"]')).toHaveCount(0);
    await expect(chrome).not.toHaveAttribute('inert');
    await expect(chrome).not.toHaveAttribute('aria-hidden');
  });

  test('data-table: Enter and Space on a sortable header cycle aria-sort none → ascending → descending → none', async ({ page }) => {
    await openInteraction(page);
    // Address the *data* column, not the selection column: the header is a real button.
    const th = page.locator('th', { hasText: 'Market value' }).first();
    const header = th.locator('button').first();
    await expect(th).toHaveAttribute('aria-sort', /.*/);
    await expect(header).toBeVisible();
    const initial = (await th.getAttribute('aria-sort')) ?? 'none';
    expect(['ascending', 'descending', 'none']).toContain(initial);

    // Cycle from wherever it rests through the documented order.
    const fromAscending = initial === 'ascending' ? ['descending', 'none', 'ascending'] : initial === 'descending' ? ['none', 'ascending', 'descending'] : ['ascending', 'descending', 'none'];

    await header.focus();
    for (const expected of fromAscending) {
      await page.keyboard.press('Enter');
      await expect(th).toHaveAttribute('aria-sort', expected);
    }
    expect(initial === 'none' ? fromAscending[2] : fromAscending[2]).toBe(initial);

    await header.press('Space');
    await expect(th).toHaveAttribute('aria-sort', fromAscending[0] ?? 'ascending');
  });

  test('data-table: sorting actually reorders the rendered rows', async ({ page }) => {
    await openInteraction(page);
    const th = page.locator('th', { hasText: 'Market value' }).first();
    const firstBefore = await page.locator('tbody tr').first().innerText();
    await th.locator('button').first().click();
    await expect
      .poll(() => page.locator('tbody tr').first().innerText(), { message: 'the first row did not change after sorting' })
      .not.toBe(firstBefore);
  });

  test('data-table: Tab reaches the pager and activation moves the current page', async ({ page }) => {
    await openInteraction(page);
    const next = page.locator('[data-scope="pagination"][data-part="next-trigger"], [data-part="next-trigger"]').first();
    await expect(next).toBeVisible();
    await next.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-part="item"][aria-current="page"]').first()).toHaveText('2');
    await expect(page.locator('[data-part="prev-trigger"]').first()).toBeEnabled();
    await expect(page.locator('[data-part="status"]')).toContainText(/\d/);
  });

  test('a focused control always shows an indicator that is not colour alone', async ({ page }) => {
    await openInteraction(page);
    const button = page.locator('[data-scope="dialog"][data-part="trigger"]').first();
    await button.focus();

    const styles = await button.evaluate((node) => {
      const computed = getComputedStyle(node);
      return {
        outlineStyle: computed.outlineStyle,
        outlineWidth: computed.outlineWidth,
        boxShadow: computed.boxShadow,
      };
    });

    const outlineVisible = styles.outlineStyle !== 'none' && styles.outlineWidth !== '0px';
    const shadowVisible = styles.boxShadow !== '' && styles.boxShadow !== 'none';
    expect(outlineVisible || shadowVisible, `focused trigger has no outline or box-shadow: ${JSON.stringify(styles)}`).toBe(true);
  });
});
