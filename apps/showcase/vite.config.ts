/**
 * Vite configuration for the fixture host.
 *
 * Defaults to port 8787. When running in dev mode, `strictPort` is false so Vite
 * smoothly falls back to the next available port (e.g. 8788) if 8787 is busy.
 * Because the browser runtime dynamically binds `@msw/source` to `window.location.origin`,
 * the showcase mock remains strictly same-origin on whichever port Vite serves.
 */
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { handleHarnessApi } from './server/harness-api.js';

/** The default port the contract's declared origin listens on. */
export const SHOWCASE_PORT = Number(process.env.PORT) || 8787;

function harnessApiPlugin(): Plugin {
  return {
    name: 'harness-api-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const handled = await handleHarnessApi(req, res);
          if (!handled) next();
        } catch (err) {
          next(err);
        }
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const handled = await handleHarnessApi(req, res);
          if (!handled) next();
        } catch (err) {
          next(err);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), harnessApiPlugin()],
  resolve: {
    // Workspace packages are linked; resolving through the symlink keeps one copy of React.
    dedupe: ['react', 'react-dom'],
  },
  server: {
    host: 'localhost',
    port: SHOWCASE_PORT,
    strictPort: false,
  },
  preview: {
    host: 'localhost',
    port: SHOWCASE_PORT,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
});
