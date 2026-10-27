import type { Meta, StoryObj } from './testing/csf.js';
import { withDarkTheme } from './testing/decorators.js';
import { BUTTON_SIZES, BUTTON_VARIANTS, Button, type UIButtonProps } from './index.js';

/**
 * `ui/Button` — CSF 3.0 stories (TOKEN-API.md §6).
 *
 * Storybook is not installed here: these files are the component's state contract in a
 * machine-readable form and the fixtures the unit tests execute. `Default`…`Dark` are the
 * states DESIGN.md names; `WithError` is the recovery action of a failed mutation — its
 * label carries the failure, because colour is never the only signal.
 */

const meta: Meta<UIButtonProps> = {
  title: 'ui/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    children: {
      control: { type: 'text' },
      type: { name: 'string', required: true },
      description: 'Label content. Icon-only buttons still need an accessible name.',
    },
    variant: {
      control: { type: 'select' },
      options: BUTTON_VARIANTS,
      defaultValue: 'primary',
      description: 'Meridian button variant.',
    },
    size: {
      control: { type: 'select' },
      options: BUTTON_SIZES,
      defaultValue: 'md',
      description: 'Maps to --control-height-sm|md|lg.',
    },
    fullWidth: { control: { type: 'boolean' }, defaultValue: false },
    loading: { control: { type: 'boolean' }, defaultValue: false },
    disabled: { control: { type: 'boolean' }, defaultValue: false },
    iconOnly: { control: { type: 'boolean' }, defaultValue: false },
  },
  args: { children: 'Submit order', variant: 'primary', size: 'md' },
  render: (args) => <Button {...args} />,
};

export default meta;

type Story = StoryObj<UIButtonProps>;

/** The resting primary action. */
export const Default: Story = {};

/** Secondary treatment: neutral surface, strong hairline. */
export const Secondary: Story = { args: { children: 'Export positions', variant: 'secondary' } };

/** Outline treatment, used where a filled block would compete with the data. */
export const Outline: Story = { args: { children: 'Reset filters', variant: 'outline' } };

/** Icon-only control; the accessible name is mandatory, not optional. */
export const IconOnly: Story = {
  render: (args) => <Button {...args} />,
  args: { variant: 'icon', iconOnly: true, 'aria-label': 'Open column options', children: '⋯' },
};

/** Disabled: dimmed, neutral ink, default cursor and a native `disabled` attribute. */
export const Disabled: Story = { args: { children: 'Submit order', disabled: true } };

/** Loading keeps the measured label width, so the toolbar never jumps. */
export const Loading: Story = { args: { children: 'Submitting order', loading: true } };

/** The recovery action after a failed mutation — the wording says what happened. */
export const WithError: Story = { args: { children: 'Retry failed transfer', variant: 'danger' } };

/** Dark mode is a re-composition, not an inversion (DESIGN.md "Colors"). */
export const Dark: Story = {
  decorators: [withDarkTheme],
  args: { children: 'Submit order', variant: 'primary' },
};
