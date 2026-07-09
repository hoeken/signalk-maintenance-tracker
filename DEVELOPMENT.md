# Development

```sh
npm install                 # backend deps
npm --prefix frontend install   # dev-only tooling (typecheck, tests, vendoring)
npm run build               # tsc → dist/ (backend only — the frontend has no build)
npm test                    # backend + frontend test suites
npm run typecheck:frontend  # tsc --checkJs over public/app (JSDoc types, no emit)
npm run lint                # eslint over src/, public/app/, and frontend/ tooling
npm run format              # eslint --fix + prettier --write (fix everything)
npm run format:check        # eslint + prettier --check (what CI enforces)
```

Formatting is [Prettier](https://prettier.io) (single quotes); linting is
[ESLint](https://eslint.org) with `typescript-eslint`, and `eslint-config-prettier`
keeps the two from fighting over style. A [husky](https://typicode.github.io/husky/)
pre-commit hook runs [lint-staged](https://github.com/lint-staged/lint-staged),
which auto-fixes and formats only the files you're committing (`npm install`
wires the hook up via the `prepare` script).

The webapp under `public/` is **buildless**: hand-written ES modules plus
pinned dependencies vendored under `public/vendor/`. Edit a `.js`/`.css` file
and reload the browser — no bundler, no HMR. To develop against a running
SignalK server, link the checkout into `~/.signalk/node_modules` (`npm link`)
and let SignalK serve `public/` directly.

To bump a vendored frontend dependency, change its pinned version in
`frontend/package.json`, then:

```sh
npm --prefix frontend install
npm --prefix frontend run vendor   # re-copies ESM files into public/vendor/
```

For backend work, `npm run watch:backend` and restart the plugin from the
admin UI.

## CI

Every push and pull request runs
[`.github/workflows/signalk-ci.yml`](.github/workflows/signalk-ci.yml):

- **`test`** — SignalK's shared [plugin-ci](https://github.com/SignalK/signalk-server/blob/master/.github/workflows/plugin-ci.yml)
  workflow builds the backend (`npm run build`), validates the plugin
  manifest/lifecycle, checks that `npm pack` ships the declared `files`, runs
  `npm run format:check` (ESLint + Prettier), and runs the backend tests.
  Pinned to Node 24 because the plugin uses the built-in `node:sqlite`
  (unflagged only from Node 24 on).
- **`unit-tests`** — installs the root and `frontend/` packages, type-checks
  `public/app` (`npm run typecheck:frontend`) and runs the full test suite
  (`npm test`).

## Releasing

Releases are automated. Pushing a `vX.Y.Z` tag triggers
[`.github/workflows/publish.yml`](.github/workflows/publish.yml), which:

1. extracts the matching `# vX.Y.Z` section from [CHANGELOG.md](CHANGELOG.md)
   and creates a GitHub Release with those notes as the body, then
2. publishes to npm using OIDC trusted publishing (with provenance).
   `prepublishOnly` runs `npm run build` first, so the published package
   contains a fresh `dist/`.

The Signal K appstore Changelog tab reads the GitHub Release notes, so the
curated CHANGELOG.md section is what users see before installing.

### One-time setup (npm trusted publishing)

No `NPM_TOKEN` is stored. Instead, configure the package on npmjs.com once:

- npm package **Settings → Trusted Publisher → GitHub Actions**
- Repository: `hoeken/signalk-maintenance-tracker`
- Workflow filename: `publish.yml`

### Cutting a release

1. **Make sure `main` is clean, pulled, builds, and tests pass:**

   ```sh
   git status
   git pull
   npm run build
   npm test
   ```

2. **Edit two files:**

   - [package.json](package.json) — bump the `version` field
   - [CHANGELOG.md](CHANGELOG.md) — add a new `# vX.Y.Z` section at the top,
     matching the style of previous entries (the version heading must match the
     tag exactly, e.g. tag `v1.1.0` → heading `# v1.1.0`)

3. **Commit:**

   ```sh
   git commit -am "release vX.Y.Z"
   ```

4. **Tag and push:**

   ```sh
   npm run release
   ```

   This pushes `main` and the `vX.Y.Z` tag; the publish workflow takes it from
   there — no `npm login` or local `npm publish` needed.

5. **Verify:**

   - [GitHub Actions](https://github.com/hoeken/signalk-maintenance-tracker/actions) — the "Publish to npm" run is green
   - [GitHub Releases](https://github.com/hoeken/signalk-maintenance-tracker/releases) — the release shows your CHANGELOG notes
   - [npm](https://www.npmjs.com/package/signalk-maintenance-tracker) — the new version is live

Pre-release tags (`v1.1.0-beta.1`, `-alpha`, `-rc`) are marked as pre-releases
on GitHub and published under the matching npm dist-tag.
