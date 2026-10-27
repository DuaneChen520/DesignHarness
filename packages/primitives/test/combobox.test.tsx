import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Combobox } from '../src/combobox.js';
import type { ComboboxOptionItem } from '../src/combobox.js';

const FRUITS: ComboboxOptionItem[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'apricot', label: 'Apricot' },
  { value: 'banana', label: 'Banana' },
  { value: 'blueberry', label: 'Blueberry' },
  { value: 'cherry', label: 'Cherry', disabled: true },
];

const Subject = ({
  onValueChange,
  multiple = false,
  defaultOpen = false,
}: {
  onValueChange?: (value: string[]) => void;
  multiple?: boolean;
  defaultOpen?: boolean;
} = {}) => (
  <Combobox.Root
    items={FRUITS}
    multiple={multiple}
    defaultOpen={defaultOpen}
    onValueChange={(details) => onValueChange?.(details.value)}
  >
    <Combobox.Label>Favourite fruit</Combobox.Label>
    <Combobox.Control>
      <Combobox.Input placeholder="Search fruit" />
      <Combobox.Trigger aria-label="Toggle options">Toggle</Combobox.Trigger>
      <Combobox.Clear aria-label="Clear selection" />
    </Combobox.Control>
    <Combobox.Positioner>
      <Combobox.Content data-testid="listbox-surface">
        <Combobox.List />
      </Combobox.Content>
    </Combobox.Positioner>
  </Combobox.Root>
);

const activeOption = (): HTMLElement => {
  const option = document.querySelector('[data-part="option"][data-highlighted]');
  if (option === null) throw new Error('no highlighted option');
  return option as HTMLElement;
};

/** Zag highlights the first option inside a `requestAnimationFrame`; let it land. */
const expectActiveOption = async (name: string | RegExp): Promise<void> => {
  await waitFor(() => expect(activeOption()).toHaveTextContent(name));
};

describe('Combobox', () => {
  it('exposes the APG combobox attributes on the input', () => {
    render(<Subject />);
    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveAttribute('aria-controls');
    expect(input).toHaveAttribute('data-scope', 'combobox');
    expect(input).toHaveAttribute('data-part', 'input');
    expect(input).toHaveAccessibleName('Favourite fruit');
    expect(screen.getByText('Favourite fruit').closest('label')).toHaveAttribute('for', input.id);
  });

  it('every part carries the frozen scope/part attributes', async () => {
    render(<Subject defaultOpen />);
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(FRUITS.length));
    for (const part of [
      'root',
      'label',
      'control',
      'trigger',
      'input',
      'clear',
      'positioner',
      'content',
      'list',
      'option',
    ]) {
      expect(document.querySelector(`[data-scope="combobox"][data-part="${part}"]`), part).not.toBeNull();
    }
  });

  it('does not open on a plain click of the input, but opens on ArrowDown', async () => {
    const user = userEvent.setup();
    render(<Subject />);
    const input = screen.getByRole('combobox');
    await user.click(input);
    expect(input).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('opens from the trigger and keeps focus on the input while the listbox is open', async () => {
    const user = userEvent.setup();
    render(<Subject />);
    const input = screen.getByRole('combobox');
    await user.click(screen.getByRole('button', { name: 'Toggle options' }));
    expect(input).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{ArrowDown}');
    await expectActiveOption('Apple');
    expect(document.activeElement).toBe(input);
    await user.keyboard('{Escape}');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(input);
  });

  it('moves the active option with ArrowDown, commits with Enter and closes', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Subject onValueChange={onValueChange} />);

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.keyboard('{ArrowDown}');

    expect(input).toHaveAttribute('aria-expanded', 'true');
    const listbox = screen.getByRole('listbox');
    const options = within(listbox).getAllByRole('option');
    expect(options).toHaveLength(FRUITS.length);
    await expectActiveOption('Apple');
    expect(input).toHaveAttribute('aria-activedescendant', options[0]?.id);

    await user.keyboard('{ArrowDown}');
    expect(options[1]).toHaveAttribute('data-highlighted');
    expect(options[0]).not.toHaveAttribute('data-highlighted');
    expect(input).toHaveAttribute('aria-activedescendant', options[1]?.id);

    await user.keyboard('{Enter}');
    expect(onValueChange).toHaveBeenCalledWith(['apricot']);
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveValue('Apricot');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.queryAllByRole('option')).toHaveLength(0));
  });

  it('types to filter, then ArrowDown + Home + Enter picks the first filtered option', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Subject onValueChange={onValueChange} />);

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.keyboard('ap');

    expect(input).toHaveValue('ap');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    const options = screen.getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['Apple', 'Apricot']);

    await user.keyboard('{ArrowDown}');
    await user.keyboard('{End}');
    expect(activeOption()).toHaveTextContent('Apricot');
    await user.keyboard('{Home}');
    expect(activeOption()).toHaveTextContent('Apple');

    await user.keyboard('{Enter}');
    expect(onValueChange).toHaveBeenCalledWith(['apple']);
    expect(input).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(screen.queryByRole('option')).not.toBeInTheDocument());
  });

  it('End jumps to the last option and Escape closes without committing', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Subject onValueChange={onValueChange} />);

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.keyboard('ap');
    await user.keyboard('{ArrowDown}');
    await expectActiveOption('Apple');
    await user.keyboard('{End}');
    const options = screen.getAllByRole('option');
    expect(options[options.length - 1]).toHaveAttribute('data-highlighted');
    expect(options[options.length - 1]).toHaveTextContent('Apricot');

    await user.keyboard('{Escape}');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(onValueChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
  });

  it('wraps to the last option when ArrowUp is pressed on the first item', async () => {
    const user = userEvent.setup();
    render(<Subject defaultOpen />);
    const input = screen.getByRole('combobox');
    input.focus();
    await user.keyboard('{ArrowDown}');
    expect(activeOption()).toHaveTextContent('Apple');
    await user.keyboard('{ArrowUp}');
    const options = screen.getAllByRole('option');
    expect(options[options.length - 2]).toHaveAttribute('data-highlighted');
  });

  it('skips disabled options while navigating and keeps them out of the selection', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Subject defaultOpen onValueChange={onValueChange} />);
    const input = screen.getByRole('combobox');
    input.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(activeOption()).toHaveTextContent('Blueberry');
    await user.keyboard('{ArrowDown}');
    expect(activeOption()).toHaveTextContent('Apple');

    const cherry = screen.getByRole('option', { name: 'Cherry' });
    expect(cherry).toHaveAttribute('aria-disabled', 'true');
    await user.click(cherry);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('supports multiple selection with aria-multiselectable and stays open', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Subject multiple defaultOpen onValueChange={onValueChange} />);
    const input = screen.getByRole('combobox');
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-multiselectable', 'true');

    await user.click(screen.getByRole('option', { name: 'Banana' }));
    expect(onValueChange).toHaveBeenLastCalledWith(['banana']);
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('option', { name: 'Banana' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('option', { name: 'Apple' }));
    expect(onValueChange).toHaveBeenLastCalledWith(['banana', 'apple']);
  });

  it('clears the selection through the clear part', async () => {
    const user = userEvent.setup();
    render(
      <Combobox.Root items={FRUITS} defaultValue={['apple']}>
        <Combobox.Label>Fruit</Combobox.Label>
        <Combobox.Control>
          <Combobox.Input />
          <Combobox.Clear aria-label="Clear" />
        </Combobox.Control>
        <Combobox.Positioner>
          <Combobox.Content>
            <Combobox.List />
          </Combobox.Content>
        </Combobox.Positioner>
      </Combobox.Root>,
    );
    expect(screen.getByRole('combobox')).toHaveValue('Apple');
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  it('runs controlled: value and open are honoured from props', () => {
    render(
      <Combobox.Root items={FRUITS} value={['banana']} open={false}>
        <Combobox.Label>Fruit</Combobox.Label>
        <Combobox.Control>
          <Combobox.Input />
        </Combobox.Control>
        <Combobox.Positioner>
          <Combobox.Content>
            <Combobox.List />
          </Combobox.Content>
        </Combobox.Positioner>
      </Combobox.Root>,
    );
    expect(screen.getByRole('combobox')).toHaveValue('Banana');
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders options through the list render-prop and reports the empty state', async () => {
    const user = userEvent.setup();
    render(
      <Combobox.Root items={FRUITS}>
        <Combobox.Label>Fruit</Combobox.Label>
        <Combobox.Control>
          <Combobox.Input />
        </Combobox.Control>
        <Combobox.Positioner>
          <Combobox.Content>
            <Combobox.List>
              {(items) =>
                items.length === 0 ? (
                  <li data-testid="empty" role="option" aria-selected="false" aria-disabled="true">
                    No matches
                  </li>
                ) : (
                  items.map((item) => (
                    <Combobox.Option key={item.value} item={item}>
                      {({ item: optionItem }) => <span>{optionItem.label.toUpperCase()}</span>}
                    </Combobox.Option>
                  ))
                )
              }
            </Combobox.List>
          </Combobox.Content>
        </Combobox.Positioner>
      </Combobox.Root>,
    );
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('option', { name: 'APPLE' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.type(input, 'zzz');
    expect(screen.getByTestId('empty')).toBeInTheDocument();
  });

  it('exposes the machine api to the root render-prop children', async () => {
    const user = userEvent.setup();
    render(
      <Combobox.Root items={FRUITS}>
        {({ open, selectedItems, inputValue }) => (
          <>
            <span data-testid="state">{`open=${String(open)} selected=${String(selectedItems.length)} query=${inputValue}`}</span>
            <Combobox.Label>Fruit</Combobox.Label>
            <Combobox.Control>
              <Combobox.Input />
            </Combobox.Control>
            <Combobox.Positioner>
              <Combobox.Content>
                <Combobox.List />
              </Combobox.Content>
            </Combobox.Positioner>
          </>
        )}
      </Combobox.Root>,
    );
    expect(screen.getByTestId('state')).toHaveTextContent('open=false selected=0 query=');
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.keyboard('{ArrowDown}');
    await expectActiveOption('Apple');
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('state')).toHaveTextContent('open=false selected=1 query=Apple');
  });

  it('marks the field invalid and required when told to', () => {
    render(
      <Combobox.Root items={FRUITS} invalid required>
        <Combobox.Label>Fruit</Combobox.Label>
        <Combobox.Control>
          <Combobox.Input />
        </Combobox.Control>
        <Combobox.Positioner>
          <Combobox.Content>
            <Combobox.List />
          </Combobox.Content>
        </Combobox.Positioner>
      </Combobox.Root>,
    );
    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('data-invalid');
  });
});
