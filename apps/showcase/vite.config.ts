/**
 * Vite configuration for the fixture host.
 *
 * The port is not a preference: `@msw/source` generates handlers bound to the origin the
 * OpenAPI document declares in its `servers` block (`http://localhost:8787`), so the showcase
 * is served from that same origin. The app's own `fetch('/api/v1/positions')` is then exactly
 * the request the generated handler matches — same-origin, no CORS allowance, no proxy, and
 * no second hand-written definition of where the API lives.
 *
 * `strictPort` is on so a busy port fails the build of the test run instead of silently
 * moving the app to an origin the handlers do not serve.
 */
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** The port the contract's declared origin listens on. */
export const SHOWCASE_PORT = 8787;

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Workspace packages are linked; resolving through the symlink keeps one copy of React.
    dedupe: ['react', 'react-dom'],
  },
  server: {
    host: 'localhost',
    port: SHOWCASE_PORT,
    strictPort: true,
  },
  preview: {
    host: 'localhost',
    port: SHOWCASE_PORT,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
});
