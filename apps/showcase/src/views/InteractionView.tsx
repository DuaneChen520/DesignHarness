/**
 * `/interaction` — the uncontrolled, keyboard-driven fixture.
 *
 * CSF stories are state *snapshots*: an "Open" dialog story is mounted controlled-open so the
 * visual and a11y sensors can see it, which means it cannot demonstrate a dismissal. The APG
 * behaviours that matter — focus returns to the trigger on Escape, the listbox closes and
 * commits, `aria-sort` cycles — need the component in exactly the state a business app mounts
 * it: uncontrolled. This page is that state, built from the same shipped `@designharness/ui`
 * components and the same token CSS, so `e2e/keyboard.spec.ts` measures the design system
 * rather than a test-only reimplementation.
 */
import {
  Combobox,
  DataTable,
  Dialog,
  type DataTableColumn,
} from '@designharness/ui';
import type { ReactNode } from 'react';

interface InstrumentRow {
  readonly id: string;
  readonly symbol: string;
  readonly name: string;
  readonly quantity: number;
  readonly marketValue: number;
  readonly status: string;
}

const INSTRUMENTS = [
  { value: 'AAPL', label: 'Apple Inc.' },
  { value: 'MSFT', label: 'Microsoft Corp.' },
  { value: 'NVDA', label: 'NVIDIA Corp.' },
  { value: 'ES', label: 'Euro Stoxx 50' },
  { value: 'SPX', label: 'S&P 500' },
] as const;

/**
 * Unsorted on purpose. `marketValue` is deliberately scattered: a fixture that is already in
 * ascending order cannot prove that sorting reorders anything, and `e2e/keyboard.spec.ts`
 * asserts exactly that.
 */
const ROWS: readonly InstrumentRow[] = [
  { id: 'row-1', symbol: 'AAPL-1', name: 'Instrument 1', quantity: 10, marketValue: 4210, status: 'open' },
  { id: 'row-2', symbol: 'MSFT-2', name: 'Instrument 2', quantity: 47, marketValue: 980, status: 'pending' },
  { id: 'row-3', symbol: 'NVDA-3', name: 'Instrument 3', quantity: 84, marketValue: 15880, status: 'closed' },
  { id: 'row-4', symbol: 'ES-4', name: 'Instrument 4', quantity: 121, marketValue: 6420, status: 'open' },
  { id: 'row-5', symbol: 'SPX-5', name: 'Instrument 5', quantity: 158, marketValue: 1205, status: 'pending' },
  { id: 'row-6', symbol: 'TSLA-6', name: 'Instrument 6', quantity: 195, marketValue: 20340, status: 'closed' },
  { id: 'row-7', symbol: 'META-7', name: 'Instrument 7', quantity: 232, marketValue: 8715, status: 'open' },
  { id: 'row-8', symbol: 'AMD-8', name: 'Instrument 8', quantity: 269, marketValue: 3300, status: 'pending' },
  { id: 'row-9', symbol: 'AAPL-9', name: 'Instrument 9', quantity: 306, marketValue: 17425, status: 'closed' },
  { id: 'row-10', symbol: 'MSFT-10', name: 'Instrument 10', quantity: 343, marketValue: 5560, status: 'open' },
  { id: 'row-11', symbol: 'NVDA-11', name: 'Instrument 11', quantity: 380, marketValue: 1145, status: 'pending' },
  { id: 'row-12', symbol: 'ES-12', name: 'Instrument 12', quantity: 17, marketValue: 9630, status: 'closed' },
  { id: 'row-13', symbol: 'SPX-13', name: 'Instrument 13', quantity: 54, marketValue: 2185, status: 'open' },
  { id: 'row-14', symbol: 'TSLA-14', name: 'Instrument 14', quantity: 91, marketValue: 14310, status: 'pending' },
  { id: 'row-15', symbol: 'META-15', name: 'Instrument 15', quantity: 128, marketValue: 7690, status: 'closed' },
  { id: 'row-16', symbol: 'AMD-16', name: 'Instrument 16', quantity: 165, marketValue: 20500, status: 'open' },
  { id: 'row-17', symbol: 'AAPL-17', name: 'Instrument 17', quantity: 202, marketValue: 4985, status: 'pending' },
  { id: 'row-18', symbol: 'MSFT-18', name: 'Instrument 18', quantity: 239, marketValue: 1320, status: 'closed' },
  { id: 'row-19', symbol: 'NVDA-19', name: 'Instrument 19', quantity: 276, marketValue: 11740, status: 'open' },
  { id: 'row-20', symbol: 'ES-20', name: 'Instrument 20', quantity: 313, marketValue: 6875, status: 'pending' },
  { id: 'row-21', symbol: 'SPX-21', name: 'Instrument 21', quantity: 350, marketValue: 2760, status: 'closed' },
  { id: 'row-22', symbol: 'TSLA-22', name: 'Instrument 22', quantity: 387, marketValue: 18935, status: 'open' },
  { id: 'row-23', symbol: 'META-23', name: 'Instrument 23', quantity: 24, marketValue: 9250, status: 'pending' },
  { id: 'row-24', symbol: 'AMD-24', name: 'Instrument 24', quantity: 61, marketValue: 3555, status: 'closed' },
];


const COLUMNS: readonly DataTableColumn<InstrumentRow>[] = [
  { accessor: 'symbol', header: 'Symbol', sortable: true, isRowHeader: true },
  { accessor: 'name', header: 'Instrument', sortable: true },
  { accessor: 'quantity', header: 'Quantity', sortable: true, valueType: 'numeric' },
  { accessor: 'marketValue', header: 'Market value', sortable: true, valueType: 'numeric' },
  { accessor: 'status', header: 'Status', sortable: true },
];

function Field(props: { readonly label: string; readonly children: ReactNode }): ReactNode {
  return (
    <section className="showcase-interaction__field" aria-label={props.label}>
      <h3 className="showcase-interaction__title">{props.label}</h3>
      {props.children}
    </section>
  );
}

export function InteractionView(): ReactNode {
  return (
    <div className="showcase-view showcase-interaction" data-role="interaction-view">
      <h2 className="showcase-view__title">Uncontrolled interaction fixture</h2>
      <p className="showcase__legend">
        Every component below is mounted the way a consuming app mounts it: uncontrolled, opened by its own trigger.
        This is where the WAI-ARIA APG keyboard assertions run, because a controlled story snapshot cannot demonstrate
        a dismissal.
      </p>

      <Field label="Combobox">
        <Combobox
          id="interaction-combobox"
          label="Instrument"
          items={INSTRUMENTS.map((instrument) => ({ ...instrument }))}
          placeholder="Search instruments"
        />
      </Field>

      <Field label="Dialog">
        <Dialog
          id="interaction-dialog"
          title="Confirm rebalance"
          trigger="Open rebalance"
          footer={<button type="button" data-role="interaction-dialog-confirm">Confirm</button>}
        >
          Move 12% of notional to cash for the hedge book?
        </Dialog>
      </Field>

      <Field label="Data table">
        <DataTable<InstrumentRow>
          columns={COLUMNS}
          rows={[...ROWS]}
          caption="Positions used by the keyboard sensor"
          selectable
        />
      </Field>
    </div>
  );
}
