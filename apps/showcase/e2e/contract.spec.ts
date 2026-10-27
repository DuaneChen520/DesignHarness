/**
 * Tier 4 sensor — contract tests in the browser: the shipped DataTable against the handlers
 * that `@msw/source` generated from the OpenAPI 3.1 document.
 *
 * Zero backend: rows come from the document's declared `example` dataset, the URL comes from
 * the document's `servers` + `paths`, and every response is parsed by the contracts package's
 * own zod guard inside the view. Sort, search and pagination round-trip through a real fetch,
 * so "the mock drifted from the contract" is a test failure rather than a runtime surprise.
 */
import { expect, test, type Page } from '@playwright/test';
import { BASE_URL } from '../playwright.config.js';

const chip = (page: Page, role: string) => page.locator(`[data-role="${role}"]`);

/** `DataTable.SearchField` renders the `<input>` itself, so the part attribute sits on it. */
const searchField = (page: Page) => page.locator('[data-scope="table"][data-part="search-field"]');

/** The chips render as `label: value`; the number is the part after the first colon. */
const chipNumber = async (page: Page, role: string): Promise<number> => {
  const text = await chip(page, role).textContent();
  return Number(text?.slice((text?.indexOf(':') ?? -1) + 1).replace(/\D/g, ''));
};

async function openPositions(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/data-table`);
  await expect(page.locator('[data-role="positions-view"]')).toBeVisible();
  // The mock took control only if the contract meta landed in the page: `total` comes from
  // the response envelope, so a missing worker (or a schema breach) leaves the dash.
  await expect(chip(page, 'total')).not.toHaveText('total: —');
  await expect(page.locator('tbody tr').first()).toBeVisible();
}

/**
 * A real `<tbody>` cannot be empty and still carry a message, so the table renders the empty
 * state as one spanning row. Only these are data rows.
 */
const dataRows = (page: Page) => page.locator('tbody tr:not(:has([data-part="empty-state"]))');

test.describe('@contract DataTable against the generated mock', () => {
  test('serves the contract example payload and satisfies the zod guard', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await openPositions(page);

    const rowCount = await dataRows(page).count();
    expect(await chipNumber(page, 'row-count'), 'row-count chip disagrees with the DOM').toBe(rowCount);
    expect(rowCount, 'the declared page size was not honoured').toBeGreaterThan(1);
    expect(await chip(page, 'last-request').textContent()).toMatch(/\/api\/v1\/positions\?/);

    const total = Number((await chip(page, 'total').textContent())?.replace(/\D/g, ''));
    expect(total, 'the contract meta.total is not a positive count').toBeGreaterThan(rowCount);

    // A contract breach is surfaced by the view as an error; it must not be present.
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
    expect(errors, `browser reported errors while serving the contract: ${errors.join(' | ')}`).toEqual([]);
  });

  test('sorting is a server round-trip that names the documented sortBy/sortOrder params', async ({ page }) => {
    await openPositions(page);
    const before = await page.locator('tbody tr').first().innerText();

    const header = page.locator('th[aria-sort] button').first();
    await expect(header).toBeVisible();
    await header.click();

    await expect(chip(page, 'last-request').textContent()).resolves.toMatch(/sortBy=/);
    await expect(chip(page, 'last-request').textContent()).resolves.toMatch(/sortOrder=/);
    await expect(header).toBeVisible();
    const after = await page.locator('tbody tr').first().innerText();
    expect(after, 'sorted response identical to the unsorted one — the request never round-tripped').not.toBe(before);
  });

  test('search filters through the documented q parameter', async ({ page }) => {
    await openPositions(page);
    const search = searchField(page);
    await expect(search).toBeVisible();

    await search.fill('AAPL');
    await expect(chip(page, 'last-request').textContent()).resolves.toMatch(/[?&]q=AAPL/);

    const rows = page.locator('tbody tr');
    await expect
      .poll(async () => rows.count(), { message: 'search did not filter the served rows' })
      .toBeGreaterThan(0);
    const count = await rows.count();
    for (let index = 0; index < count; index += 1) {
      await expect(rows.nth(index)).toContainText(/AAPL/i);
    }
  });

  test('pagination requests the next page and the pager follows the contract meta', async ({ page }) => {
    await openPositions(page);
    const firstBefore = await page.locator('tbody tr').first().innerText();
    const total = Number((await chip(page, 'total').textContent())?.replace(/\D/g, ''));

    await expect(chip(page, 'page').textContent()).resolves.toContain('page: 1');
    const next = page.locator('[data-part="next-trigger"]');
    await expect(next).toBeEnabled();
    await next.click();

    await expect(chip(page, 'last-request').textContent()).resolves.toMatch(/[?&]page=2/);
    await expect(chip(page, 'page').textContent()).resolves.toContain('page: 2');
    await expect(page.locator('[data-part="item"][aria-current="page"]')).toHaveText('2');
    await expect
      .poll(async () => page.locator('tbody tr').first().innerText())
      .not.toBe(firstBefore);
    await expect(page.locator('[data-part="status"]')).toContainText(new RegExp(String.raw`\d`));
    expect(total).toBeGreaterThan(10);
  });

  test('a query that matches nothing renders the declared empty state, not a crash', async ({ page }) => {
    await openPositions(page);
    const search = searchField(page);
    await search.fill('zzzz-no-such-instrument');

    await expect(page.locator('[data-part="empty-state"]')).toBeVisible();
    await expect(dataRows(page)).toHaveCount(0);
    expect(await chipNumber(page, 'row-count'), 'the row-count chip still reports rows').toBe(0);
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
  });
});
