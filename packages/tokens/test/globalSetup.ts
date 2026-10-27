/**
 * Compiles the real pipeline once before any worker starts:
 *  - the package's own generated tree is materialised if a fresh clone or a turbo
 *    cache restore left it out (the runtime API and the Tailwind proof read it);
 *  - a throwaway tree is compiled from DESIGN.md so every contract assertion runs
 *    against freshly generated output rather than whatever happens to be checked in.
 */
import { ensureFreshBuild, ensurePackageBuilt } from './helpers/pipeline.js';

export default async function setup(): Promise<void> {
  ensurePackageBuilt();
  ensureFreshBuild();
}
