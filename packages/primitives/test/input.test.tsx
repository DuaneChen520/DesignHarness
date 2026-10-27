import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from '../src/input.js';

describe('Input primitive normalization (WAI-ARIA APG)', () => {
  it('associates label and input via htmlFor / id', () => {
    render(
      <Input.Root>
        <Input.Label>Account number</Input.Label>
        <Input.Input />
      </Input.Root>,
    );

    const input = screen.getByLabelText('Account number');
    const label = screen.getByText('Account number');
    expect(label).toHaveAttribute('for', input.id);
  });

  it('manages disabled state on root and input', () => {
    const { rerender } = render(
      <Input.Root disabled>
        <Input.Label>Username</Input.Label>
        <Input.Input />
      </Input.Root>,
    );

    const input = screen.getByLabelText('Username');
    const root = screen.getByLabelText('Username').parentElement;

    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('data-disabled', '');
    expect(root).toHaveAttribute('data-disabled', '');

    rerender(
      <Input.Root>
        <Input.Label>Username</Input.Label>
        <Input.Input disabled />
      </Input.Root>,
    );
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('data-disabled', '');
  });

  it('manages readOnly state on root and input', () => {
    const { rerender } = render(
      <Input.Root readOnly>
        <Input.Label>Read only field</Input.Label>
        <Input.Input />
      </Input.Root>,
    );

    const input = screen.getByLabelText('Read only field') as HTMLInputElement;
    const root = input.parentElement;

    expect(input.readOnly).toBe(true);
    expect(input).toHaveAttribute('data-readonly', '');
    expect(root).toHaveAttribute('data-readonly', '');

    rerender(
      <Input.Root>
        <Input.Label>Read only field</Input.Label>
        <Input.Input readOnly />
      </Input.Root>,
    );
    expect(input.readOnly).toBe(true);
    expect(input).toHaveAttribute('data-readonly', '');
  });

  it('manages invalid state: automatically composes aria-invalid and aria-describedby', () => {
    render(
      <Input.Root invalid>
        <Input.Label>Email</Input.Label>
        <Input.Input aria-describedby="custom-help" />
        <Input.Description>Enter your corporate email</Input.Description>
        <Input.ErrorText>Invalid email format</Input.ErrorText>
      </Input.Root>,
    );

    const input = screen.getByLabelText('Email');
    const root = input.parentElement;
    const description = screen.getByText('Enter your corporate email');
    const errorText = screen.getByRole('alert');

    expect(root).toHaveAttribute('data-invalid', '');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('data-invalid', '');

    const describedBy = input.getAttribute('aria-describedby')?.split(/\s+/) ?? [];
    expect(describedBy).toContain(description.id);
    expect(describedBy).toContain(errorText.id);
    expect(describedBy).toContain('custom-help');

    // Verify no duplicates
    const uniqueIds = new Set(describedBy);
    expect(uniqueIds.size).toBe(describedBy.length);
  });

  it('automatically treats field as invalid when ErrorText is mounted', () => {
    const { rerender } = render(
      <Input.Root>
        <Input.Label>Username</Input.Label>
        <Input.Input />
      </Input.Root>,
    );

    const input = screen.getByLabelText('Username');
    expect(input).not.toHaveAttribute('aria-invalid');

    rerender(
      <Input.Root>
        <Input.Label>Username</Input.Label>
        <Input.Input />
        <Input.ErrorText>Username is required</Input.ErrorText>
      </Input.Root>,
    );

    expect(input).toHaveAttribute('aria-invalid', 'true');
    const errorText = screen.getByRole('alert');
    expect(input.getAttribute('aria-describedby')).toContain(errorText.id);
  });

  it('allows overriding invalid prop directly on Input.Input', () => {
    render(
      <Input.Root invalid={false}>
        <Input.Label>Code</Input.Label>
        <Input.Input invalid />
      </Input.Root>,
    );

    const input = screen.getByLabelText('Code');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('data-invalid', '');
  });
});
