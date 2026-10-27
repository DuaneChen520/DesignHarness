import type { Meta, StoryObj } from './testing/csf.js';
import { withDarkTheme } from './testing/decorators.js';
import { Input, type UIInputProps } from './index.js';

/**
 * `ui/Input` — CSF 3.0 stories.
 *
 * DESIGN.md "Components": the label is always visible, the placeholder carries an example
 * rather than an instruction, and the error is icon + wording joined to the control with
 * `aria-describedby` — all of which the primitive wires, never this file.
 */

const meta: Meta<UIInputProps> = {
  title: 'ui/Input',
  component: Input,
  tags: ['autodocs'],
  argTypes: {
    label: {
      control: { type: 'text' },
      type: { name: 'string', required: true },
      description: 'Always-visible label text.',
    },
    description: { control: { type: 'text' }, description: 'Helper text joined through aria-describedby.' },
    error: { control: { type: 'text' }, description: 'Error message; rendering it makes the field invalid.' },
    placeholder: { control: { type: 'text' }, description: 'An example value, never an instruction.' },
    required: { control: { type: 'boolean' }, defaultValue: false },
    disabled: { control: { type: 'boolean' }, defaultValue: false },
    readOnly: { control: { type: 'boolean' }, defaultValue: false },
    value: { control: { type: 'text' } },
    name: { control: { type: 'text' } },
  },
  args: {
    label: 'Risk limit',
    placeholder: 'e.g. 250000',
    name: 'risk-limit',
    value: '250000',
  },
  render: (args) => <Input {...args} />,
};

export default meta;

type Story = StoryObj<UIInputProps>;

/** Required field with helper text. */
export const Default: Story = { args: { required: true, description: 'Notional cap per counterparty, in USD.' } };

/** Optional secondary field: no required marker, quiet helper copy. */
export const Secondary: Story = {
  args: { label: 'Desk note', placeholder: 'e.g. hedged via ES', description: 'Stored on the audit trail.' },
};

/** Disabled control: sunken surface, dashed-free hairline, native `disabled`. */
export const Disabled: Story = { args: { disabled: true, description: 'Locked while the position is settling.' } };

/** Read-only while an upstream refresh is in flight — the field is still legible. */
export const Loading: Story = {
  args: {
    label: 'Reference price',
    readOnly: true,
    value: '121.44',
    description: 'Syncing from the pricing service…',
  },
};

/** Error: `role="alert"`, `aria-invalid`, an icon glyph and wording. Never colour alone. */
export const WithError: Story = {
  args: {
    label: 'Risk limit',
    value: '-1',
    required: true,
    error: 'Limit must be greater than zero.',
  },
};

/** Dark re-composition: inks go off-white, the hairline stays perceptible. */
export const Dark: Story = {
  decorators: [withDarkTheme],
  args: { required: true, description: 'Notional cap per counterparty, in USD.' },
};
