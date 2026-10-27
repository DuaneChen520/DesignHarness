import { connect, machine } from '@zag-js/toggle';
import { normalizeProps, useMachine } from '@zag-js/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

const ToggleProbe = () => {
  const service = useMachine(machine, { defaultPressed: false });
  const api = connect(service, normalizeProps);
  return <button {...api.getRootProps()}>toggle</button>;
};

describe('toolchain smoke', () => {
  it('drives the zag toggle machine', async () => {
    const user = userEvent.setup();
    render(<ToggleProbe />);
    const button = screen.getByRole('button', { name: 'toggle' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await user.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('has requestAnimationFrame available in jsdom', async () => {
    expect(typeof window.requestAnimationFrame).toBe('function');
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
    await waitFor(() => expect(document.body).toBeInTheDocument());
  });
});
