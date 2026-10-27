import type { Meta, StoryObj } from './testing/csf.js';
import { withDarkTheme } from './testing/decorators.js';
import { INSTRUMENT_ITEMS, type InstrumentFixture } from './testing/data.js';
import { Combobox, type UIComboboxProps } from './index.js';

/**
 * `ui/Combobox` — CSF 3.0 stories, including the async states the contracts drive.
 *
 * The `@zag-js/combobox` machine owns `role="combobox"`, `aria-expanded`,
 * `aria-activedescendant` and the APG keyboard map (ArrowUp/Down, Home/End, Enter, Escape).
 */

type ComboArgs = UIComboboxProps<InstrumentFixture>;

const meta: Meta<ComboArgs> = {
  title: 'ui/Combobox',
  component: Combobox,
  tags: ['autodocs'],
  argTypes: {
    label: {
      control: { type: 'text' },
      type: { name: 'string', required: true },
      description: 'Always-visible label; the placeholder is never the label.',
    },
    items: {
      control: false,
      type: { name: 'array', required: true },
      description: 'The option list (server page, for async sources).',
    },
    placeholder: { control: { type: 'text' } },
    loading: { control: { type: 'boolean' }, defaultValue: false },
    clearable: { control: { type: 'boolean' }, defaultValue: true },
    disabled: { control: { type: 'boolean' }, defaultValue: false },
    invalid: { control: { type: 'boolean' }, defaultValue: false },
    required: { control: { type: 'boolean' }, defaultValue: false },
    defaultOpen: { control: { type: 'boolean' }, defaultValue: false },
    defaultValue: { control: { type: 'multi-select' } },
    multiple: { control: { type: 'boolean' }, defaultValue: false },
    inputValue: { control: { type: 'text' } },
    emptyText: { control: { type: 'text' } },
    loadingText: { control: { type: 'text' } },
  },
  args: {
    label: 'Instrument',
    items: INSTRUMENT_ITEMS,
    placeholder: 'e.g. NVDA',
    defaultValue: [],
  },
  render: (args) => <Combobox {...args} />,
};

export default meta;

type Story = StoryObj<ComboArgs>;

/** Resting single-select combobox with a committed value, so the clear button shows. */
export const Default: Story = { args: { defaultValue: ['NVDA'] } };

/** Rendered open: the listbox is mounted, highlighted and `aria-expanded="true"`. */
export const Open: Story = { args: { defaultOpen: true } };

/** Secondary treatment: a pre-filled multi-select over the same collection. */
export const Secondary: Story = {
  args: { label: 'Accounts', multiple: true, defaultValue: ['AAPL', 'GC'], placeholder: 'e.g. prime, hedge' },
};

/** Disabled control: the machine marks it and the seam goes quiet. */
export const Disabled: Story = { args: { disabled: true, defaultValue: ['ES'] } };

/** Async search in flight: dashed seam, spinner glyph, "Searching…" row. */
export const Loading: Story = {
  args: { defaultOpen: true, inputValue: 'TSL', items: [], loading: true, loadingText: 'Searching instruments…' },
};

/** Invalid value: `aria-invalid` plus heavier typed ink; the message lives in the form. */
export const WithError: Story = {
  args: { label: 'Instrument', required: true, invalid: true, defaultValue: [], inputValue: 'AAPLX' },
};

/** Dark re-composition of the option surface, with the hairline still reading. */
export const Dark: Story = {
  decorators: [withDarkTheme],
  args: { defaultOpen: true },
};
