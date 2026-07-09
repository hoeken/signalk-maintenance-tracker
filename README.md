# signalk-maintenance-tracker

A [SignalK](https://signalk.org) server plugin that tracks recurring boat
maintenance — oil changes, winch service, watermaker pickling, and anything
else that comes due by engine hours, by calendar time, or both.

## Features

- **Tasks with two interval dimensions** — runtime hours (read live from a
  SignalK path such as `propulsion.port.runTime`) and/or calendar time
  (days/weeks/months/years). Tasks with neither interval work as
  informational records.
- **Status tracking** — each task is `overdue`, `due soon`, `ok`, or
  `unknown`; the task list sorts most-urgent first.
- **Maintenance log** — per-task history plus a master log across all tasks,
  with markdown notes and who logged the work.
- **SignalK notifications** — overdue/due-soon status is published to
  `notifications.maintenance.{slug}` (`alarm`/`warn`/`normal`), so it shows up
  in any SignalK notification consumer.
- **Modern webapp** — buildless Preact SPA served from the SignalK webapps
  menu: searchable/filterable task table, tag chips, progress bars, light/dark
  theme, live polling. Runs on browsers as old as Chromium 69 (Navico/B&G
  MFDs) — no bundler, no transpile step; the files in `public/` are exactly
  what the browser executes.
- **SignalK-native auth** — the webapp logs in against the server's own
  `/signalk/v1/auth/*` endpoints; the server enforces access to the API. The
  plugin adds no auth of its own.
- **Zero native dependencies** — SQLite via Node's built-in `node:sqlite`,
  ideal on a Raspberry Pi. Requires **Node ≥ 22.5** (SignalK on Node 24
  recommended).

## Install

From the SignalK Appstore (once published), or manually:

```sh
cd ~/.signalk
npm install signalk-maintenance-tracker
```

Enable the plugin in the SignalK admin UI (Server → Plugin Config →
Maintenance Tracker). The webapp appears under Webapps as **Maintenance
Tracker**; data is stored in the plugin's data directory as `maintenance.db`.

### Plugin options

| option                   | default      | purpose                                      |
| ------------------------ | ------------ | -------------------------------------------- |
| `enableNotifications`    | `true`       | master switch for notification publishing    |
| `notificationMethods`    | `["visual"]` | SignalK notification `method`                |
| `runtimeNotifyLeadHours` | `10`         | runtime hours before due to raise "due soon" |
| `timeNotifyLeadDays`     | `7`          | days before due to raise "due soon"          |
| `recomputeIntervalMs`    | `60000`      | status recompute tick in ms                  |

## REST API

Mounted at `/plugins/signalk-maintenance-tracker/api` (access controlled by
the SignalK server — currently admin):

- `GET/POST /tasks`, `GET/PUT/DELETE /tasks/:slug`
- `GET/POST /tasks/:slug/logs` (POST = mark complete)
- `GET /logs`, `PUT/DELETE /logs/:id`
- `GET /tags`
- `GET /health`

See [docs/specification.md](docs/specification.md) for the full spec.

## Development

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

### CI

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

## License

MIT
