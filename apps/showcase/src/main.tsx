/**
 * Entry point.
 *
 * The mock is started before the app mounts, but only for the route that talks to the API:
 * a fixture host whose a11y and visual gates depend on a service worker they do not need is
 * a fixture host that fails for the wrong reason. If the worker cannot start, the failure is
 * logged and the app still mounts — the contract gate then fails on its own assertions rather
 * than on a blank page.
 */
import { createRoot } from 'react-dom/client';
import { App, ROUTES } from './App.js';
import { startShowcaseMock } from './mock-runtime.js';
import './styles.css';

async function bootstrap(): Promise<void> {
  const container = document.getElementById('root');
  if (container === null) {
    throw new Error('showcase: #root is missing from index.html, so nothing can mount.');
  }

  if (window.location.pathname.replace(/\/+$/, '') === ROUTES.dataTable) {
    try {
      await startShowcaseMock();
    } catch (cause) {
      console.error('[showcase] the MSW worker did not start; /data-table will report a failed request.', cause);
    }
  }

  // Deliberately not `<StrictMode>`: the double mount it devotes to finding bugs would give
  // the visual and a11y sensors two competing lifecycles for the same section to measure.
  createRoot(container).render(<App />);
}

void bootstrap();
