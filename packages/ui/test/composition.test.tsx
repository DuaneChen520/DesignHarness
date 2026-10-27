import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button, Combobox, DataTable, Dialog, Input } from '../src/index.js';
import { INSTRUMENT_ITEMS, POSITION_COLUMNS, POSITION_ROWS } from '../src/testing/data.js';

/**
 * Composition contract.
 *
 * The styled layer is allowed to add class names and its own markup; it is not allowed to
 * re-implement, rename or override anything the primitives emit. Every assertion below is
 * either "the frozen `data-scope`/`data-part` pair still exists" or "the machine still owns
 * this ARIA attribute" — plus one negative rule: elements that only the styled layer renders
 * carry no `role`, no `aria-*` beyond `aria-hidden`, and no inline style.
 */

/** `scope:part` pairs present in the rendered tree. */
function partPairs(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-part]')).map(
    (element) => `${element.getAttribute('data-scope') ?? 'none'}:${element.getAttribute('data-part') ?? 'none'}`,
  );
}

/** Elements this package renders itself — anatomy parts always carry `data-scope`. */
function styledLayerOnlyElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[class*="dh-"]')).filter(
    (element) => !element.hasAttribute('data-scope') && !element.hasAttribute('data-part'),
  );
}

function ariaAttributesOf(element: Element): string[] {
  return Array.from(element.attributes)
    .filter((attribute) => attribute.name.startsWith('aria-'))
    .map((attribute) => attribute.name);
}

describe('styled layer adds no ARIA and no inline styles of its own', () => {
  it('keeps every element it owns presentational', () => {
    const { container } = render(
      <Dialog
        title="Rebalance confirmation"
        defaultOpen
        footer={
          <>
            <Button variant="secondary">Cancel</Button>
            <Button loading>Applying</Button>
          </>
        }
      >
        This moves 12 positions across two books.
      </Dialog>,
    );
    const combobox = render(<Combobox label="Instrument" items={INSTRUMENT_ITEMS} defaultValue={['NVDA']} defaultOpen />);

    const owned = [...styledLayerOnlyElements(container), ...styledLayerOnlyElements(combobox.container)];
    expect(owned.length).toBeGreaterThan(0);

    for (const element of owned) {
      expect(element.getAttribute('role'), `${element.className} must not declare a role`).toBeNull();
      expect(ariaAttributesOf(element).filter((name) => name !== 'aria-hidden'), `${element.className} adds ARIA`).toEqual(
        [],
      );
      expect(element.hasAttribute('style'), `${element.className} must not carry an inline style`).toBe(false);
    }
  });
});

describe('Button composition', () => {
  it('renders the frozen button anatomy', () => {
    const { container } = render(<Button>Save</Button>);
    expect(partPairs(container)).toEqual(expect.arrayContaining(['button:root']));
    const button = container.querySelector('button');
    expect(button).not.toBeNull();
    expect(button?.getAttribute('data-scope')).toBe('button');
    expect(button?.getAttribute('data-part')).toBe('root');
  });

  it('leaves the machine-owned busy/disabled attributes to the primitive', async () => {
    const { container } = render(
      <Button loading onClick={undefined}>
        Submitting
      </Button>,
    );
    const button = container.querySelector('button');
    expect(button?.getAttribute('aria-busy')).toBe('true');
    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute('aria-disabled')).toBe('true');
    expect(button?.getAttribute('data-loading')).toBe('');

    const resting = render(<Button>Save</Button>).container.querySelector('button');
    expect(resting?.getAttribute('aria-busy')).toBeNull();
    expect(resting?.hasAttribute('aria-pressed')).toBe(false);

    await userEvent.click(resting as HTMLButtonElement);
    expect(resting?.textContent).toBe('Save');
  });

  it('keeps the label mounted while loading so the width cannot jump', () => {
    const { container } = render(<Button loading>Submitting order</Button>);
    const label = container.querySelector('.dh-button__label');
    expect(label?.textContent).toBe('Submitting order');
    expect(container.querySelector('.dh-button__spinner')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('Input composition', () => {
  it('renders the full input anatomy and lets the control own the describedby chain', () => {
    const { container } = render(
      <Input label="Risk limit" description="Notional cap per counterparty." error="Limit must be greater than zero." required />,
    );
    expect(partPairs(container)).toEqual(
      expect.arrayContaining(['input:root', 'input:label', 'input:input', 'input:description', 'input:error-text']),
    );

    const input = container.querySelector('input') as HTMLInputElement;
    const label = container.querySelector('label') as HTMLLabelElement;
    const errorText = container.querySelector('[data-part="error-text"]') as HTMLElement;

    expect(label.htmlFor).toBe(input.id);
    expect(input.getAttribute('aria-describedby')).toContain(errorText.id);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-required')).toBe('true');
    expect(input.required).toBe(true);
    expect(errorText.getAttribute('role')).toBe('alert');
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1);
  });

  it('does not duplicate the label association or the invalid state', () => {
    const { container } = render(<Input label="Desk note" />);
    const input = container.querySelector('input') as HTMLInputElement;
    const root = container.querySelector('[data-part="root"]') as HTMLElement;
    expect(input.getAttribute('aria-labelledby')).toBeNull();
    expect(root.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });
});

describe('Combobox composition', () => {
  it('renders the frozen combobox anatomy', () => {
    const { container } = render(<Combobox label="Instrument" items={INSTRUMENT_ITEMS} defaultValue={['NVDA']} defaultOpen />);
    expect(partPairs(container)).toEqual(
      expect.arrayContaining([
        'combobox:root',
        'combobox:label',
        'combobox:control',
        'combobox:input',
        'combobox:trigger',
        'combobox:clear',
        'combobox:positioner',
        'combobox:content',
        'combobox:list',
        'combobox:option',
      ]),
    );
  });

  it('keeps role="combobox" and aria-expanded on the machine-owned input', async () => {
    const { container } = render(<Combobox label="Instrument" items={INSTRUMENT_ITEMS} />);
    const input = container.querySelector('input') as HTMLInputElement;

    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelectorAll('[role="combobox"]')).toHaveLength(1);

    // APG combobox: the listbox opens from the keyboard, not from a bare pointer click.
    await userEvent.click(input);
    await userEvent.keyboard('{ArrowDown}');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-controls')).toBe(container.querySelector('[data-part="content"]')?.id);

    await userEvent.keyboard('{ArrowDown}');
    expect(input.getAttribute('aria-activedescendant')).toMatch(/.+/);
    expect(container.querySelectorAll('[role="option"]').length).toBeGreaterThan(0);
  });

  it('surfaces async state without touching the machine attributes', () => {
    const { container } = render(<Combobox label="Instrument" items={[]} loading loadingText="Searching instruments…" defaultOpen />);
    const loadingRow = container.querySelector('.dh-combobox__loading');
    expect(loadingRow?.textContent).toBe('Searching instruments…');
    // A `role="listbox"` must own at least one `role="option"` (axe `aria-required-children`),
    // so the loading row is an owned but `aria-disabled` option — and it stays unclaimed by the
    // machine: no `data-part="option"`, no `data-highlighted`, no `data-value`.
    expect(loadingRow?.getAttribute('role')).toBe('option');
    expect(loadingRow?.getAttribute('aria-disabled')).toBe('true');
    expect(loadingRow?.hasAttribute('data-part')).toBe(false);
    expect(loadingRow?.hasAttribute('data-highlighted')).toBe(false);
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('Dialog composition', () => {
  it('renders the frozen dialog anatomy and lets the machine own the naming', () => {
    const { container } = render(
      <Dialog title="Settlement failed" defaultOpen footer={<Button variant="danger">Resend</Button>}>
        Nothing has been booked.
      </Dialog>,
    );
    expect(partPairs(container)).toEqual(
      expect.arrayContaining([
        'dialog:root',
        'dialog:backdrop',
        'dialog:positioner',
        'dialog:content',
        'dialog:header',
        'dialog:title',
        'dialog:body',
        'dialog:close-trigger',
      ]),
    );

    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    const title = container.querySelector('[data-part="title"]') as HTMLElement;
    const body = container.querySelector('[data-part="body"]') as HTMLElement;
    expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(dialog.getAttribute('aria-labelledby')).toBe(title.id);
    expect(dialog.getAttribute('aria-describedby')).toBe(body.id);
    expect(dialog.getAttribute('data-open')).toBe('');
    expect(dialog.getAttribute('data-part')).toBe('content');

    const footer = container.querySelector('.dh-dialog__footer') as HTMLElement;
    expect(footer.getAttribute('data-part')).toBeNull();
    expect(footer.getAttribute('role')).toBeNull();
    expect(footer.textContent).toBe('Resend');
  });

  it('gives the close trigger a machine-owned accessible name', () => {
    const { container } = render(
      <Dialog title="Discard draft" defaultOpen>
        Your draft filter will be lost.
      </Dialog>,
    );
    const close = container.querySelector('[data-part="close-trigger"]') as HTMLButtonElement;
    expect(close.getAttribute('aria-label')).toBe('Close');
    expect(close.querySelector('.dh-dialog__close-glyph')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('DataTable composition', () => {
  it('renders the frozen table anatomy', () => {
    const { container } = render(
      <DataTable
        columns={POSITION_COLUMNS}
        rows={POSITION_ROWS}
        selectable
        caption="Open positions by book"
        total={128}
        defaultPageSize={1}
      />,
    );
    expect(partPairs(container)).toEqual(
      expect.arrayContaining([
        'table:root',
        'table:toolbar',
        'table:search-field',
        'table:table',
        'table:caption',
        'table:head',
        'table:row',
        'table:columnheader',
        'table:rowheader',
        'table:cell',
        'table:select',
        'table:pagination',
        'table:pagination-page-text',
        'table:first-trigger',
        'table:prev-trigger',
        'table:item',
        'table:ellipsis',
        'table:next-trigger',
        'table:last-trigger',
        'table:status',
      ]),
    );
  });

  it('leaves aria-sort on the columnheader and the sort button inside it', async () => {
    const onQueryChange = vi.fn();
    const { container } = render(<DataTable columns={POSITION_COLUMNS} rows={POSITION_ROWS} onQueryChange={onQueryChange} />);

    const symbolHeader = container.querySelector('[data-part="columnheader"]') as HTMLElement;
    expect(symbolHeader.getAttribute('aria-sort')).toBe('none');
    const sortButton = symbolHeader.querySelector('button') as HTMLButtonElement;
    expect(sortButton.getAttribute('aria-label')).toBe('Sort by Symbol');

    await userEvent.click(sortButton);
    expect(symbolHeader.getAttribute('aria-sort')).toBe('ascending');
    expect(onQueryChange).toHaveBeenCalledWith(expect.objectContaining({ sortBy: 'symbol', sortOrder: 'asc' }));

    await userEvent.click(sortButton);
    expect(symbolHeader.getAttribute('aria-sort')).toBe('descending');

    // Only the primitive puts aria-sort anywhere in the tree.
    const sortOwners = Array.from(container.querySelectorAll('[aria-sort]'));
    expect(sortOwners.every((element) => element.getAttribute('data-part') === 'columnheader')).toBe(true);
  });

  it('keeps the pager a labelled nav region with machine-owned aria-current', () => {
    const { container } = render(<DataTable columns={POSITION_COLUMNS} rows={POSITION_ROWS} defaultPageSize={1} />);
    const nav = container.querySelector('[data-part="pagination"]') as HTMLElement;
    expect(nav.tagName).toBe('NAV');
    expect(nav.getAttribute('aria-label')).toMatch(/pagination/i);
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(container.querySelector('.dh-data-table__footer')?.getAttribute('role')).toBeNull();
    expect(container.querySelector('[data-part="status"]')?.getAttribute('role')).toBe('status');
  });

  it('routes the empty, loading and error states through the primitive regions', () => {
    const empty = render(<DataTable columns={POSITION_COLUMNS} rows={[]} emptyText="No positions match." />).container;
    expect(empty.querySelector('[data-part="empty-state"]')?.getAttribute('role')).toBe('status');
    expect(empty.querySelector('[data-part="empty-state"]')?.textContent).toBe('No positions match.');

    const loading = render(<DataTable columns={POSITION_COLUMNS} rows={[]} loading />).container;
    expect(loading.querySelector('[data-part="empty-state"]')?.getAttribute('role')).toBe('status');
    expect(loading.querySelector('[data-part="table"]')?.getAttribute('aria-busy')).toBe('true');

    const failed = render(<DataTable columns={POSITION_COLUMNS} rows={[]} error="Position feed unavailable (503)." />).container;
    const alert = failed.querySelector('[data-part="empty-state"]');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toBe('Position feed unavailable (503).');
  });

  it('preserves numeric alignment as attributes, never as inline styles', () => {
    const { container } = render(<DataTable columns={POSITION_COLUMNS} rows={POSITION_ROWS} defaultPageSize={1} />);
    const numericCell = container.querySelector('td[data-value-type="numeric"]') as HTMLElement;
    expect(numericCell.getAttribute('data-align')).toBe('end');
    expect(numericCell.hasAttribute('style')).toBe(false);
    expect(numericCell.textContent).toBe('12500');
  });
});
