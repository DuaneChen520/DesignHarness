import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  BUTTON_BLOCK,
  BUTTON_SIZES,
  BUTTON_VARIANTS,
  COMBOBOX_BLOCK,
  DATA_TABLE_BLOCK,
  DIALOG_BLOCK,
  DIALOG_SIZES,
  INPUT_BLOCK,
  Button,
  Combobox,
  DataTable,
  Dialog,
  Input,
  buttonClassNames,
  dialogContentClassNames,
} from '../src/index.js';
import { INSTRUMENT_ITEMS, POSITION_COLUMNS, POSITION_ROWS } from '../src/testing/data.js';

/**
 * Prop → class mapping.
 *
 * Variants are props, never element types: the class list is the only contract the CSS
 * reads, so it is asserted both as a pure function and on the rendered DOM.
 */

const classListOf = (element: Element | null | undefined): string[] =>
  element === null || element === undefined ? [] : Array.from(element.classList);

describe('buttonClassNames', () => {
  it('defaults to the primary md treatment', () => {
    expect(buttonClassNames({})).toBe('dh-button dh-button--primary dh-button--md');
  });

  it('maps every variant and every size to its own modifier', () => {
    for (const variant of BUTTON_VARIANTS) {
      expect(buttonClassNames({ variant })).toContain(`${BUTTON_BLOCK}--${variant}`);
    }
    for (const size of BUTTON_SIZES) {
      expect(buttonClassNames({ size })).toContain(`${BUTTON_BLOCK}--${size}`);
    }
  });

  it('adds the loading and full-width modifiers and keeps the consumer class last', () => {
    expect(buttonClassNames({ loading: true, fullWidth: true })).toBe(
      'dh-button dh-button--primary dh-button--md dh-button--full-width dh-button--loading',
    );
    expect(buttonClassNames({ className: 'mt-4' }).endsWith('mt-4')).toBe(true);
  });

  it('never emits a colour, size or state class outside the block', () => {
    for (const className of buttonClassNames({ variant: 'danger', size: 'sm' }).split(' ')) {
      expect(className.startsWith(BUTTON_BLOCK)).toBe(true);
    }
  });
});

describe('Button rendering', () => {
  it('puts the variant and size classes on the anatomy root', () => {
    const { container } = render(
      <Button variant="outline" size="lg" fullWidth>
        Reset filters
      </Button>,
    );
    const button = container.querySelector('button');
    expect(classListOf(button)).toEqual([
      BUTTON_BLOCK,
      'dh-button--outline',
      'dh-button--lg',
      'dh-button--full-width',
    ]);
  });

  it('adds the loading class only while the request is in flight', () => {
    const idle = render(<Button>Save</Button>).container.querySelector('button');
    expect(classListOf(idle)).not.toContain('dh-button--loading');

    const busy = render(<Button loading>Save</Button>).container.querySelector('button');
    expect(classListOf(busy)).toContain('dh-button--loading');
    expect(busy?.querySelector('.dh-button__spinner')).not.toBeNull();
  });

  it('styles the icon variant without changing the button element', () => {
    const { container } = render(
      <Button variant="icon" iconOnly aria-label="Open column options">
        ⋯
      </Button>,
    );
    const button = container.querySelector('button');
    expect(classListOf(button)).toContain('dh-button--icon');
    expect(button?.getAttribute('data-icon-only')).toBe('');
    expect(button?.getAttribute('aria-label')).toBe('Open column options');
  });
});

describe('Input rendering', () => {
  it('marks the field root with the block class and the error modifier', () => {
    const clean = render(<Input label="Desk note" />).container.querySelector('[data-part="root"]');
    expect(classListOf(clean)).toEqual([INPUT_BLOCK]);

    const errored = render(<Input label="Risk limit" error="Limit must be greater than zero." />).container.querySelector(
      '[data-part="root"]',
    );
    expect(classListOf(errored)).toEqual([INPUT_BLOCK, 'dh-input--error']);
  });

  it('renders the error glyph inside the alert region only when there is an error', () => {
    const withError = render(<Input label="Risk limit" error="Required." />).container;
    expect(withError.querySelector('.dh-input__error-glyph')?.textContent).toBe('!');
    const withoutError = render(<Input label="Risk limit" />).container;
    expect(withoutError.querySelector('.dh-input__error-glyph')).toBeNull();
    expect(withoutError.querySelector('[data-part="error-text"]')).toBeNull();
  });
});

describe('Combobox rendering', () => {
  it('adds the loading modifier to the anatomy root while a search is in flight', () => {
    const idle = render(<Combobox label="Instrument" items={INSTRUMENT_ITEMS} />).container.querySelector(
      '[data-part="root"]',
    );
    expect(classListOf(idle)).toEqual([COMBOBOX_BLOCK]);

    const busy = render(<Combobox label="Instrument" items={[]} loading />).container.querySelector('[data-part="root"]');
    expect(classListOf(busy)).toEqual([COMBOBOX_BLOCK, 'dh-combobox--loading']);
  });

  it('gives the disclosure and clear controls their element classes and glyphs', () => {
    const { container } = render(<Combobox label="Instrument" items={INSTRUMENT_ITEMS} defaultValue={['NVDA']} />);
    const trigger = container.querySelector('[data-part="trigger"]');
    expect(classListOf(trigger)).toEqual(['dh-combobox__trigger']);
    expect(trigger?.querySelector('.dh-combobox__chevron')).not.toBeNull();

    const clear = container.querySelector('[data-part="clear"]');
    expect(classListOf(clear)).toEqual(['dh-combobox__clear']);
    expect(clear?.querySelector('.dh-combobox__clear-glyph')?.textContent).toBe('×');
  });

  it('swaps the chevron for a spinner while loading', () => {
    const { container } = render(<Combobox label="Instrument" items={INSTRUMENT_ITEMS} loading />);
    const trigger = container.querySelector('[data-part="trigger"]');
    expect(trigger?.querySelector('.dh-combobox__chevron')).toBeNull();
    expect(trigger?.querySelector('.dh-combobox__spinner')).not.toBeNull();
  });
});

describe('Dialog rendering', () => {
  it('maps size onto the dialog surface', () => {
    for (const size of DIALOG_SIZES) {
      const { container } = render(
        <Dialog title="Discard draft" size={size} defaultOpen>
          Your draft filter will be lost.
        </Dialog>,
      );
      const content = container.querySelector('[data-part="content"]');
      expect(classListOf(content)).toEqual([DIALOG_BLOCK, `dh-dialog--${size}`]);
      container.remove();
    }
  });

  it('renders the footer only when one is supplied', () => {
    const withoutFooter = render(
      <Dialog title="Discard draft" defaultOpen>
        Body copy.
      </Dialog>,
    ).container;
    expect(withoutFooter.querySelector('.dh-dialog__footer')).toBeNull();

    const withFooter = render(
      <Dialog title="Discard draft" defaultOpen footer={<Button variant="secondary">Cancel</Button>}>
        Body copy.
      </Dialog>,
    ).container;
    expect(withFooter.querySelector('.dh-dialog__footer')?.children).toHaveLength(1);
  });

  it('exposes the class mapping as a pure helper', () => {
    expect(dialogContentClassNames()).toBe('dh-dialog dh-dialog--md');
    expect(dialogContentClassNames('lg', 'shadow-none')).toBe('dh-dialog dh-dialog--lg shadow-none');
  });
});

describe('DataTable rendering', () => {
  it('puts the block class on the anatomy root and the element classes on its own wrappers', () => {
    const { container } = render(<DataTable columns={POSITION_COLUMNS} rows={POSITION_ROWS} />);
    expect(classListOf(container.querySelector('[data-part="root"]'))).toEqual([DATA_TABLE_BLOCK]);
    expect(classListOf(container.querySelector('[data-part="toolbar"]'))).toEqual(['dh-data-table__toolbar']);
    expect(classListOf(container.querySelector('[data-part="table"]'))).toEqual(['dh-data-table__table']);
    expect(container.querySelector('.dh-data-table__footer')).not.toBeNull();
  });

  it('omits the toolbar and the pager chrome when asked to', () => {
    const { container } = render(
      <DataTable columns={POSITION_COLUMNS} rows={POSITION_ROWS} showToolbar={false} showPagination={false} />,
    );
    expect(container.querySelector('[data-part="toolbar"]')).toBeNull();
    expect(container.querySelector('[data-part="pagination"]')).toBeNull();
    expect(container.querySelector('[data-part="status"]')).toBeNull();
  });

  it('renders toolbar actions in their own element', () => {
    const { container } = render(
      <DataTable
        columns={POSITION_COLUMNS}
        rows={POSITION_ROWS}
        toolbarActions={<Button variant="secondary">Export</Button>}
      />,
    );
    const actions = container.querySelector('.dh-data-table__toolbar-actions');
    expect(actions?.textContent).toBe('Export');
    expect(actions?.hasAttribute('data-part')).toBe(false);
  });
});
