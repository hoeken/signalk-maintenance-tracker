/**
 * Copies the pinned runtime dependencies from frontend/node_modules into
 * ../public/vendor as plain ESM files the browser loads directly (§3).
 *
 * Bare specifiers are rewritten to relative paths because the app cannot use
 * import maps (Chrome 89+; our floor is Chromium 69). Re-run after bumping a
 * dependency version in frontend/package.json:  npm run vendor
 */
import { copyFileSync, cpSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const nm = join(here, '..', 'node_modules');
const vendor = join(here, '..', '..', 'public', 'vendor');

mkdirSync(vendor, { recursive: true });

/** Copy one ESM file, rewriting bare import specifiers to relative paths. */
function vendorFile(src, dest, specifierMap = {}) {
  let code = readFileSync(join(nm, src), 'utf8');
  for (const [bare, rel] of Object.entries(specifierMap)) {
    // matches from"x", from "x", from'x' — the forms the dists actually use
    code = code.replaceAll(`from"${bare}"`, `from"${rel}"`);
    code = code.replaceAll(`from "${bare}"`, `from "${rel}"`);
    code = code.replaceAll(`from'${bare}'`, `from'${rel}'`);
    code = code.replaceAll(`from '${bare}'`, `from '${rel}'`);
  }
  // strip sourceMappingURL comments — the maps are not vendored
  code = code.replace(/\/\/#\s*sourceMappingURL=.*$/gm, '');
  writeFileSync(join(vendor, dest), code);
  console.log(`vendored ${dest}`);
}

vendorFile('preact/dist/preact.module.js', 'preact.js');
vendorFile('preact/hooks/dist/hooks.module.js', 'preact-hooks.js', {
  preact: './preact.js',
});
vendorFile('@preact/signals-core/dist/signals-core.module.js', 'signals-core.js');
vendorFile('@preact/signals/dist/signals.module.js', 'signals.js', {
  // longest first so "preact/hooks" is not clobbered by the "preact" rewrite
  '@preact/signals-core': './signals-core.js',
  'preact/hooks': './preact-hooks.js',
  preact: './preact.js',
});
vendorFile('htm/dist/htm.module.js', 'htm.js');
vendorFile('snarkdown/dist/snarkdown.es.js', 'snarkdown.js');

// day.js — its ESM tree uses extensionless relative imports; browsers need
// explicit ./x.js, so append .js while copying the files the app pulls in.
function vendorDayjsFile(rel) {
  const src = join(nm, 'dayjs', 'esm', `${rel}.js`);
  let code = readFileSync(src, 'utf8');
  code = code.replace(/(from\s+['"])(\.[^'"]+)(['"])/g, (m, pre, path, post) =>
    path.endsWith('.js') ? m : `${pre}${path}.js${post}`
  );
  const dest = join(vendor, 'dayjs', `${rel}.js`);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, code);
  console.log(`vendored dayjs/${rel}.js`);
}
for (const f of ['index', 'constant', 'utils', 'locale/en']) vendorDayjsFile(f);

// Bootstrap Icons — stylesheet + woff2 webfont, loaded via <link> in index.html.
const biDir = join(vendor, 'bootstrap-icons');
mkdirSync(join(biDir, 'fonts'), { recursive: true });
copyFileSync(join(nm, 'bootstrap-icons/font/bootstrap-icons.css'), join(biDir, 'bootstrap-icons.css'));
cpSync(join(nm, 'bootstrap-icons/font/fonts'), join(biDir, 'fonts'), { recursive: true });
console.log('vendored bootstrap-icons');

// Sibling .d.ts shims so the frontend type-check (tsc --checkJs over
// public/app) types imports of the vendored files against the real package
// types (resolved via tsconfig "paths") instead of checking minified JS.
const shims = {
  'preact.d.ts': "export * from 'preact';\n",
  'preact-hooks.d.ts': "export * from 'preact/hooks';\n",
  'signals.d.ts': "export * from '@preact/signals';\n",
  'signals-core.d.ts': "export * from '@preact/signals-core';\n",
  'htm.d.ts': "export { default } from 'htm';\n",
  'snarkdown.d.ts': "export { default } from 'snarkdown';\n",
  'dayjs/index.d.ts': "export { default } from 'dayjs';\n",
};
for (const [file, body] of Object.entries(shims)) writeFileSync(join(vendor, file), body);
console.log('wrote type shims');

// Record what was vendored, for humans diffing public/vendor.
const versions = {};
for (const pkg of ['preact', '@preact/signals', '@preact/signals-core', 'htm', 'snarkdown', 'dayjs', 'bootstrap-icons']) {
  versions[pkg] = JSON.parse(readFileSync(join(nm, pkg, 'package.json'), 'utf8')).version;
}
writeFileSync(join(vendor, 'VERSIONS.json'), JSON.stringify(versions, null, 2) + '\n');
console.log('wrote VERSIONS.json', versions);
