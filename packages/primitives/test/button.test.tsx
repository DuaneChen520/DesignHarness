import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../src/button.js';

describe('Button primitive normalization (WAI-ARIA APG)', () => {
  describe('Standard Action Button (default)', () => {
    it('behaves as a standard HTML button with type="button" by default', () => {
      render(<Button.Root>Click me</Button.Root>);
      const button = screen.getByRole('button', { name: 'Click me' });

      expect(button).toHaveAttribute('type', 'button');
      expect(button).not.toHaveAttribute('aria-pressed');
      expect(button).not.toHaveAttribute('data-state');
      expect(button).toHaveAttribute('data-scope', 'button');
      expect(button).toHaveAttribute('data-part', 'root');
    });

    it('does not emit aria-pressed or toggle on repeated clicks', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<Button.Root onClick={handleClick}>Action</Button.Root>);
      const button = screen.getByRole('button', { name: 'Action' });

      expect(button).not.toHaveAttribute('aria-pressed');
      await user.click(button);
      expect(handleClick).toHaveBeenCalledTimes(1);
      expect(button).not.toHaveAttribute('aria-pressed');
      expect(button).not.toHaveAttribute('data-state');

      await user.click(button);
      expect(handleClick).toHaveBeenCalledTimes(2);
      expect(button).not.toHaveAttribute('aria-pressed');
    });

    it('supports native activation semantics via Space and Enter keys', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<Button.Root onClick={handleClick}>Action</Button.Root>);
      const button = screen.getByRole('button', { name: 'Action' });

      button.focus();
      await user.keyboard('{Enter}');
      expect(handleClick).toHaveBeenCalledTimes(1);

      await user.keyboard(' ');
      expect(handleClick).toHaveBeenCalledTimes(2);
      expect(button).not.toHaveAttribute('aria-pressed');
    });

    it('respects explicit type="submit" and type="reset"', () => {
      const { rerender } = render(<Button.Root type="submit">Submit</Button.Root>);
      expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');

      rerender(<Button.Root type="reset">Reset</Button.Root>);
      expect(screen.getByRole('button')).toHaveAttribute('type', 'reset');
    });

    it('handles disabled and loading states', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      const { rerender } = render(<Button.Root disabled onClick={handleClick}>Disabled</Button.Root>);
      const button = screen.getByRole('button');

      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAttribute('data-disabled', '');

      await user.click(button);
      expect(handleClick).not.toHaveBeenCalled();

      rerender(<Button.Root loading onClick={handleClick}>Loading</Button.Root>);
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(button).toHaveAttribute('data-loading', '');

      await user.click(button);
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('Toggle Button mode', () => {
    it('activates toggle machine and binds aria-pressed and data-state when toggle=true', async () => {
      const user = userEvent.setup();
      render(<Button.Root toggle>Mute</Button.Root>);
      const button = screen.getByRole('button', { name: 'Mute' });

      expect(button).toHaveAttribute('aria-pressed', 'false');
      expect(button).toHaveAttribute('data-state', 'off');

      await user.click(button);
      expect(button).toHaveAttribute('aria-pressed', 'true');
      expect(button).toHaveAttribute('data-state', 'on');

      await user.click(button);
      expect(button).toHaveAttribute('aria-pressed', 'false');
      expect(button).toHaveAttribute('data-state', 'off');
    });

    it('activates toggle mode when defaultPressed is provided', async () => {
      const user = userEvent.setup();
      render(<Button.Root defaultPressed>Bookmark</Button.Root>);
      const button = screen.getByRole('button', { name: 'Bookmark' });

      expect(button).toHaveAttribute('aria-pressed', 'true');
      expect(button).toHaveAttribute('data-state', 'on');

      await user.click(button);
      expect(button).toHaveAttribute('aria-pressed', 'false');
      expect(button).toHaveAttribute('data-state', 'off');
    });

    it('activates toggle mode when pressed is controlled', async () => {
      const handlePressedChange = vi.fn();
      const { rerender } = render(
        <Button.Root pressed={false} onPressedChange={handlePressedChange}>
          Pin
        </Button.Root>,
      );
      const button = screen.getByRole('button', { name: 'Pin' });

      expect(button).toHaveAttribute('aria-pressed', 'false');
      expect(button).toHaveAttribute('data-state', 'off');

      const user = userEvent.setup();
      await user.click(button);
      expect(handlePressedChange).toHaveBeenCalledWith(true);

      rerender(
        <Button.Root pressed={true} onPressedChange={handlePressedChange}>
          Pin
        </Button.Root>,
      );
      expect(button).toHaveAttribute('aria-pressed', 'true');
      expect(button).toHaveAttribute('data-state', 'on');
    });
  });
});
