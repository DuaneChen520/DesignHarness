/**
 * The `inert` mirror that closes Zag 1.46's modal gap.
 *
 * Two levels are asserted: the helper on its own (marker → inert → released, including
 * elements marked after the effect ran) and the real `Dialog` primitive, so the guarantee is
 * tied to the component the design system ships rather than to a detached utility.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Dialog } from '../src/dialog.js';
import { syncInertWithAriaHidden } from '../src/internal/inert.js';

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('syncInertWithAriaHidden', () => {
  it('mirrors machine-hidden background onto inert and releases it', async () => {
    const background = document.createElement('header');
    const link = document.createElement('button');
    link.textContent = 'page action';
    background.append(link);
    document.body.append(background);

    const surface = document.createElement('div');
    surface.setAttribute('role', 'dialog');
    const inside = document.createElement('button');
    surface.append(inside);
    document.body.append(surface);

    const release = syncInertWithAriaHidden();
    try {
      // Already-marked content is picked up on the first pass.
      background.setAttribute('data-aria-hidden', '');
      background.setAttribute('aria-hidden', 'true');
      await tick();
      expect(background.hasAttribute('inert')).toBe(true);
      expect(link.closest('[inert]')).toBe(background);

      // Content marked later (Zag hides in its own effect) is caught by the observer.
      const late = document.createElement('footer');
      document.body.append(late);
      late.setAttribute('data-aria-hidden', '');
      await waitFor(() => expect(late.hasAttribute('inert')).toBe(true));

      // The dialog surface itself must never be made inert.
      expect(surface.hasAttribute('inert')).toBe(false);
    } finally {
      release();
    }

    expect(background.hasAttribute('inert')).toBe(false);
    const late = document.querySelector('footer[data-aria-hidden]');
    expect(late?.hasAttribute('inert')).toBe(false);
    background.remove();
    surface.remove();
    document.querySelector('footer[data-aria-hidden]')?.remove();
  });
});

describe('Dialog modal background', () => {
  it('makes everything the machine hides also non-focusable, and restores it on close', async () => {
    const user = userEvent.setup();
    const chrome = document.createElement('button');
    chrome.textContent = 'background action';
    document.body.append(chrome);

    try {
      render(
        <Dialog.Root modal>
          <Dialog.Trigger>Open rebalance</Dialog.Trigger>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>Confirm rebalance</Dialog.Title>
                <Dialog.CloseTrigger>Close</Dialog.CloseTrigger>
              </Dialog.Header>
              <Dialog.Body>Move 12% of notional to cash?</Dialog.Body>
            </Dialog.Content>
          </Dialog.Positioner>
        </Dialog.Root>,
      );

      await user.click(screen.getByRole('button', { name: 'Open rebalance' }));
      await screen.findByRole('dialog');

      // Zag marks the background with `data-aria-hidden` + `aria-hidden`; the mirror must make
      // that claim true for keyboard users as well, or axe reports `aria-hidden-focus`.
      const marked = await waitFor(() => {
        const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-aria-hidden]'));
        expect(nodes.length, 'the machine hid no background content, so the mirror has nothing to prove').toBeGreaterThan(0);
        return nodes;
      }, { timeout: 3_000 });

      for (const node of marked) {
        expect(node.getAttribute('aria-hidden')).toBe('true');
        expect(node.closest('[role="dialog"]')).toBeNull();
        await waitFor(() => expect(node.hasAttribute('inert')).toBe(true), { timeout: 2_000 });
      }
      expect(marked.includes(chrome) ? chrome.getAttribute('inert') !== null : true).toBe(true);

      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await waitFor(
        () => expect(document.querySelectorAll('[data-aria-hidden][inert]').length).toBe(0),
        { timeout: 3_000 },
      );
    } finally {
      chrome.remove();
    }
  });

  it('leaves background content reachable for a non-modal dialog', async () => {
    render(
      <Dialog.Root modal={false} defaultOpen>
        <Dialog.Trigger>Filters</Dialog.Trigger>
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Filter helper</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>Non-modal: the page stays interactive.</Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>,
    );

    await screen.findByRole('dialog');
    await tick();
    expect(document.querySelectorAll('[data-aria-hidden][inert]').length).toBe(0);
  });
});
