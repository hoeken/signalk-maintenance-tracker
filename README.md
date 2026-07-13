# signalk-maintenance-tracker

A [SignalK](https://signalk.org) server plugin that tracks recurring boat
maintenance — oil changes, winch service, watermaker filters, and anything
else that comes due by engine hours, by calendar time, or both.

## Features

- **Tasks with two interval dimensions** — runtime hours (read live from a
  SignalK path such as `propulsion.port.runTime`) and/or calendar time
  (days/weeks/months/years). Add a one-time calendar due date for a one-off
  job, or leave every interval blank to keep a plain informational record.
- **Status tracking** — each task is `overdue`, `due soon`, `ok`, or
  `unknown`; the task list sorts most-urgent first. Any task can override the
  plugin-wide "due soon" lead windows with its own runtime-hours and
  calendar-days thresholds.
- **Maintenance log** — per-task history plus a master log across all tasks,
  with markdown notes and who logged the work. Export the log as CSV,
  Markdown, or JSON.
- **Inventory integration** — link the parts a task consumes to your
  [signalk-stowage-mgmt](https://www.npmjs.com/package/signalk-stowage-mgmt)
  inventory, see live stock badges next to each task, and auto-decrement stock
  when a task is completed. Fully opt-in (see below).
- **SignalK notifications and paths** — overdue/due-soon status is published to
  `notifications.maintenance.{slug}` with a configurable alarm state per task
  status, and each task can also publish to `maintenance.{slug}.data` and
  `maintenance.{slug}.status`, so it shows up in any SignalK notification
  consumer or dashboard.
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

| option                   | default | purpose                                           |
| ------------------------ | ------- | ------------------------------------------------- |
| `enablePublishPaths`     | `true`  | publish each task to `maintenance.{slug}.*` paths |
| `enableNotifications`    | `true`  | master switch for notification publishing         |
| `alarmStateOk`           | `none`  | alarm state for up-to-date tasks                  |
| `alarmStateDueSoon`      | `warn`  | alarm state for due-soon tasks                    |
| `alarmStateOverdue`      | `alarm` | alarm state for overdue tasks                     |
| `runtimeNotifyLeadHours` | `10`    | runtime hours before due to raise "due soon"      |
| `timeNotifyLeadDays`     | `7`     | days before due to raise "due soon"               |
| `recomputeIntervalMs`    | `60000` | status recompute tick in ms                       |
| `stowageMgmtUrl`         | `''`    | signalk-stowage-mgmt API URL (blank = disabled)   |

## 🔧 Inventory integration: signalk-stowage-mgmt

Maintenance tasks can now link directly to your
[signalk-stowage-mgmt](https://www.npmjs.com/package/signalk-stowage-mgmt)
inventory. Set the **signalk-stowage-mgmt API URL** option (e.g.
`http://localhost:3000/plugins/signalk-stowage-mgmt`) to turn it on:

- **Link parts to tasks** — "Oil change" needs a filter and 5&nbsp;L of oil? Tag
  them right in the task editor, autocompleted straight from your stowage-mgmt
  items.
- **See stock at a glance** — tasks show `In stock` / `Low stock` /
  `Out of stock` right next to the due-date badge. No more "task's due but I'm
  out of filters" surprises.
- **Auto-decrement on completion** — mark a task done and it knocks the used
  quantity off your inventory automatically (opt-in checkbox, on by default).
- **Split across locations? You pick.** If a part lives in more than one spot on
  the boat, you choose which location(s) it came from right in the completion
  dialog — no guessing on the software's part.

**Fully optional** — leave the API URL blank (the default) and none of this does
anything.

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

Setup, the buildless webapp workflow, CI, and the release process are
documented in [DEVELOPMENT.md](DEVELOPMENT.md).

## License

MIT
