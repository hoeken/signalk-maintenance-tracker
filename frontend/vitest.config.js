import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Tests import the app modules from ../public/app, which import the vendored
// ESM copies by relative path. Alias those vendor files to the packages in
// THIS package's node_modules (absolute paths — the importers live outside
// frontend/, so bare specifiers would not resolve), and funnel the bare
// preact-family specifiers used by @testing-library/preact to the same files
// so the whole test process shares ONE preact instance.
const nm = (p) => fileURLToPath(new URL('./node_modules/' + p, import.meta.url));

const PREACT = nm('preact/dist/preact.mjs');
const HOOKS = nm('preact/hooks/dist/hooks.mjs');
const SIGNALS = nm('@preact/signals/dist/signals.mjs');
const SIGNALS_CORE = nm('@preact/signals-core/dist/signals-core.mjs');

export default defineConfig({
  resolve: {
    alias: [
      { find: /^.*\/vendor\/preact\.js$/, replacement: PREACT },
      { find: /^.*\/vendor\/preact-hooks\.js$/, replacement: HOOKS },
      { find: /^.*\/vendor\/signals\.js$/, replacement: SIGNALS },
      { find: /^.*\/vendor\/signals-core\.js$/, replacement: SIGNALS_CORE },
      { find: /^.*\/vendor\/htm\.js$/, replacement: nm('htm/dist/htm.mjs') },
      { find: /^.*\/vendor\/snarkdown\.js$/, replacement: nm('snarkdown/dist/snarkdown.es.js') },
      { find: /^.*\/vendor\/dayjs\/index\.js$/, replacement: nm('dayjs/esm/index.js') },
      { find: /^preact$/, replacement: PREACT },
      { find: /^preact\/hooks$/, replacement: HOOKS },
      { find: /^@preact\/signals$/, replacement: SIGNALS },
      { find: /^@preact\/signals-core$/, replacement: SIGNALS_CORE },
    ],
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.js'],
    setupFiles: ['test/setup.js'],
    restoreMocks: true,
  },
});
