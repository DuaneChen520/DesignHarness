import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from '../src/dialog.js';

const Subject = ({
  onClose,
  modal = true,
  closeOnEscape = true,
  closeOnInteractOutside = true,
}: {
  onClose?: (open: boolean) => void;
  modal?: boolean;
  closeOnEscape?: boolean;
  closeOnInteractOutside?: boolean;
} = {}) => (
  <Dialog.Root
    modal={modal}
    closeOnEscape={closeOnEscape}
    closeOnInteractOutside={closeOnInteractOutside}
    // `onClose` observes dismissals only: the open transition is not a close, so the
    // destructive-dialog test can assert that no dismissal was ever requested.
    onOpenChange={(details) => {
      if (!details.open) onClose?.(details.open);
    }}
  >
    <Dialog.Trigger>Open settings</Dialog.Trigger>
    <Dialog.Backdrop data-testid="backdrop" />
    <Dialog.Positioner>
      <Dialog.Content data-testid="dialog">
        <Dialog.Header data-testid="header">
          <Dialog.Title>Settings</Dialog.Title>
          <Dialog.CloseTrigger />
        </Dialog.Header>
        <Dialog.Body data-testid="body">
          <button type="button">First</button>
          <button type="button">Second</button>
        </Dialog.Body>
      </Dialog.Content>
    </Dialog.Positioner>
  </Dialog.Root>
);

/**
 * Awaits the moment the machine has fully handed the scrim over to the user: the dialog
 * is open and the backdrop part is mounted, no longer `hidden`, `data-state="open"` and
 * enabled — the attributes that make it a hit-testable dismiss target. Then it restores
 * `pointer-events: auto` on the scrim: while a modal layer is up, Zag locks interaction
 * outside the dialog with `pointer-events: none` on `<body>`, and jsdom — unlike a
 * browser whose styled layer re-enables the scrim — inherits that lock onto the backdrop
 * and would refuse the pointer for reasons that have nothing to do with the contract.
 */
const expectBackdropClickable = async (): Promise<void> => {
  await waitFor(() => {
    const backdrop = screen.getByTestId('backdrop') as HTMLElement;
    expect(backdrop).toBeInTheDocument();
    expect(backdrop).toHaveAttribute('data-scope', 'dialog');
    expect(backdrop).toHaveAttribute('data-part', 'backdrop');
    expect(backdrop).toHaveAttribute('data-state', 'open');
    expect(backdrop).not.toHaveAttribute('hidden');
    expect(backdrop).toBeEnabled();
    backdrop.style.setProperty('pointer-events', 'auto');
    expect(getComputedStyle(backdrop).pointerEvents).toBe('auto');
  });
  expect(screen.getByRole('dialog')).toBeInTheDocument();
};

describe('Dialog', () => {
  it('renders a closed dialog without exposing it to assistive technology', () => {
    render(<Subject />);
    expect(screen.getByRole('button', { name: 'Open settings' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Open settings' })).toHaveAttribute('aria-haspopup', 'dialog');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('emits the frozen dialog anatomy parts', async () => {
    const user = userEvent.setup();
    render(<Subject />);
    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    for (const part of [
      'root',
      'trigger',
      'backdrop',
      'positioner',
      'content',
      'header',
      'title',
      'body',
      'close-trigger',
    ]) {
      expect(document.querySelector(`[data-scope="dialog"][data-part="${part}"]`), part).not.toBeNull();
    }
  });

  it('moves focus into the dialog on open and labels it by the title', async () => {
    const user = userEvent.setup();
    render(<Subject />);
    const trigger = screen.getByRole('button', { name: 'Open settings' });
    await user.click(trigger);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('data-part', 'content');
    const title = screen.getByRole('heading', { level: 2, name: 'Settings' });
    expect(dialog).toHaveAttribute('aria-labelledby', title.id);
    await waitFor(() => expect(dialog).toHaveAttribute('aria-describedby', screen.getByTestId('body').id));
    expect(within(dialog).getByRole('button', { name: 'First' })).toBeInTheDocument();
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  });

  it('traps Tab and Shift+Tab inside the dialog while it is open', async () => {
    const user = userEvent.setup();
    render(<Subject />);
    const trigger = screen.getByRole('button', { name: 'Open settings' });
    await user.click(trigger);

    const dialog = screen.getByRole('dialog');
    const controls = within(dialog).getAllByRole('button');
    expect(controls).toHaveLength(3);

    within(dialog).getByRole('button', { name: 'First' }).focus();
    const visited = new Set<Element>();
    for (let index = 0; index < 6; index += 1) {
      await user.tab();
      const active = document.activeElement as Element;
      expect(dialog.contains(active), `forward tab ${String(index)} escaped the dialog`).toBe(true);
      visited.add(active);
    }
    // more than one control is reachable, and the trigger behind the dialog never is
    expect(visited.size).toBeGreaterThan(1);
    expect(trigger).not.toHaveFocus();

    for (let index = 0; index < 4; index += 1) {
      await user.tab({ shift: true });
      const active = document.activeElement as Element;
      expect(dialog.contains(active), `backward tab ${String(index)} escaped the dialog`).toBe(true);
    }
    expect(trigger).not.toHaveFocus();
  });

  it('closes on Escape and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Subject onClose={onClose} />);
    const trigger = screen.getByRole('button', { name: 'Open settings' });
    await user.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledWith(false);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('closes from the close trigger and keeps focus reachable afterwards', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Subject onClose={onClose} />);
    const trigger = screen.getByRole('button', { name: 'Open settings' });
    await user.click(trigger);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenLastCalledWith(false);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('closes on a backdrop click by default', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Subject onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    await expectBackdropClickable();
    await user.click(screen.getByTestId('backdrop'));
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(false));
  });

  it('keeps a destructive dialog open when interact-outside and Escape are disabled', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Subject onClose={onClose} closeOnEscape={false} closeOnInteractOutside={false} />);
    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    await user.keyboard('{Escape}');
    await expectBackdropClickable();
    await user.click(screen.getByTestId('backdrop'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('supports controlled open state', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <Dialog.Root open={false}>
        <Dialog.Trigger>Open settings</Dialog.Trigger>
        <Dialog.Content data-testid="dialog">
          <Dialog.Title>Settings</Dialog.Title>
          <Dialog.Body>Content</Dialog.Body>
        </Dialog.Content>
      </Dialog.Root>,
    );
    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(
      <Dialog.Root open>
        <Dialog.Trigger>Open settings</Dialog.Trigger>
        <Dialog.Content data-testid="dialog">
          <Dialog.Title>Settings</Dialog.Title>
          <Dialog.Body>Content</Dialog.Body>
        </Dialog.Content>
      </Dialog.Root>,
    );
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('falls back to aria-label when no title is rendered', async () => {
    const user = userEvent.setup();
    render(
      <Dialog.Root aria-label="Confirm transfer">
        <Dialog.Trigger>Open</Dialog.Trigger>
        <Dialog.Content>
          <Dialog.Body>Details</Dialog.Body>
        </Dialog.Content>
      </Dialog.Root>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-label', 'Confirm transfer');
    expect(dialog).not.toHaveAttribute('aria-labelledby');
  });

  it('renders an alertdialog role for destructive confirmations', async () => {
    const user = userEvent.setup();
    render(
      <Dialog.Root role="alertdialog">
        <Dialog.Trigger>Delete</Dialog.Trigger>
        <Dialog.Content>
          <Dialog.Title>Are you sure?</Dialog.Title>
          <Dialog.Body>This cannot be undone.</Dialog.Body>
          <Dialog.CloseTrigger>Cancel</Dialog.CloseTrigger>
        </Dialog.Content>
      </Dialog.Root>,
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('lets children read the open state through the render prop', async () => {
    const user = userEvent.setup();
    render(
      <Dialog.Root>
        {({ open }) => (
          <>
            <span data-testid="state">{open ? 'open' : 'closed'}</span>
            <Dialog.Trigger>Open settings</Dialog.Trigger>
            <Dialog.Content>
              <Dialog.Title>Settings</Dialog.Title>
              <Dialog.Body>Content</Dialog.Body>
            </Dialog.Content>
          </>
        )}
      </Dialog.Root>,
    );
    expect(screen.getByTestId('state')).toHaveTextContent('closed');
    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(screen.getByTestId('state')).toHaveTextContent('open');
  });
});
