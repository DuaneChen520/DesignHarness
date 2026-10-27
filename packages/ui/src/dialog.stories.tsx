import type { Meta, StoryObj } from './testing/csf.js';
import { withDarkTheme } from './testing/decorators.js';
import { Button, Dialog, type UIDialogProps } from './index.js';

/**
 * `ui/Dialog` — CSF 3.0 stories.
 *
 * Focus moves in on open, is trapped while open and returns to the trigger on close;
 * `role="dialog"`, `aria-modal`, `aria-labelledby` and `aria-describedby` are all machine
 * owned. `Dialog.Open` renders the mounted surface so the state is inspectable without a
 * click.
 */

const meta: Meta<UIDialogProps> = {
  title: 'ui/Dialog',
  component: Dialog,
  tags: ['autodocs'],
  argTypes: {
    title: {
      control: { type: 'text' },
      type: { name: 'string', required: true },
      description: 'Becomes the dialog’s accessible name via aria-labelledby.',
    },
    children: { control: { type: 'text' }, type: { name: 'string', required: true }, description: 'Body content.' },
    size: { control: { type: 'select' }, options: ['sm', 'md', 'lg'], defaultValue: 'md' },
    trigger: { control: { type: 'text' }, description: 'Trigger label; omit for a fully controlled dialog.' },
    triggerProps: { control: false, description: 'Props for the rendered trigger.' },
    footer: { control: false, description: 'Action row. Styled-layer markup, not a frozen anatomy part.' },
    closable: { control: { type: 'boolean' }, defaultValue: true },
    defaultOpen: { control: { type: 'boolean' }, defaultValue: false },
    closeOnInteractOutside: { control: { type: 'boolean' }, defaultValue: true },
    closeOnEscape: { control: { type: 'boolean' }, defaultValue: true },
    modal: { control: { type: 'boolean' }, defaultValue: true },
  },
  args: {
    title: 'Rebalance confirmation',
    trigger: 'Rebalance',
    children: 'This moves 12 positions across two books. The action is logged against your operator id.',
  },
  render: (args) => <Dialog {...args} />,
};

export default meta;

type Story = StoryObj<UIDialogProps>;

/** Closed surface plus its trigger — the state a page loads in. */
export const Default: Story = {
  args: { footer: <Button variant="secondary">Cancel</Button> },
};

/** Rendered open: backdrop, positioner, header, body and footer are all mounted. */
export const Open: Story = {
  args: { defaultOpen: true, footer: <Button variant="secondary">Cancel</Button> },
};

/** Secondary treatment: the compact confirm surface. */
export const Secondary: Story = {
  args: { size: 'sm', title: 'Discard draft', defaultOpen: true, children: 'Your draft filter will be lost.' },
};

/** The trigger itself is disabled, so the dialog cannot be opened at all. */
export const Disabled: Story = {
  args: { triggerProps: { disabled: true }, footer: <Button variant="secondary">Cancel</Button> },
};

/** A pending mutation: the confirm action keeps its label width while it runs. */
export const Loading: Story = {
  args: {
    defaultOpen: true,
    closeOnInteractOutside: false,
    closeOnEscape: false,
    footer: (
      <>
        <Button variant="secondary">Cancel</Button>
        <Button loading>Applying</Button>
      </>
    ),
  },
};

/** Unrecoverable action: dismissal is switched off and the danger action names the risk. */
export const WithError: Story = {
  args: {
    title: 'Settlement failed',
    defaultOpen: true,
    closeOnInteractOutside: false,
    children: 'The counterparty rejected message MT-543. Nothing has been booked; correct the amount and resend.',
    footer: (
      <>
        <Button variant="secondary">Close</Button>
        <Button variant="danger">Resend settlement</Button>
      </>
    ),
  },
};

/** Dark re-composition: the overlay keeps a border because a shadow reads as nothing. */
export const Dark: Story = {
  decorators: [withDarkTheme],
  args: { defaultOpen: true, footer: <Button variant="secondary">Cancel</Button> },
};
