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

| option | default | purpose |
|---|---|---|
| `enableNotifications` | `true` | master switch for notification publishing |
| `notificationMethods` | `["visual"]` | SignalK notification `method` |
| `runtimeNotifyLeadHours` | `10` | runtime hours before due to raise "due soon" |
| `timeNotifyLeadDays` | `7` | days before due to raise "due soon" |
| `recomputeIntervalMs` | `60000` | status recompute tick |

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
```

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

## License

MIT
