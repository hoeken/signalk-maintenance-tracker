# signalk-maintenance-tracker — Implementation Specification

Status: draft v1
Supersedes the high-level [initial-spec.md](initial-spec.md) with concrete implementation detail.

---

## 1. Overview

A SignalK server plugin that tracks recurring boat maintenance tasks (oil changes,
winch service, watermaker maintenance, etc.). Each task has runtime- and/or
time-based intervals, a completion log, and freeform tag categories. The plugin
serves a React single-page webapp for managing tasks and viewing overdue/upcoming
maintenance.

### Goals
- Create, edit, delete, and complete maintenance tasks through a modern webapp.
- Track "remaining" runtime and time per task, and surface overdue/upcoming work.
- Keep a per-task log and a master log of all completed maintenance.
- Read engine/equipment runtime from SignalK internally; publish overdue/upcoming
  status back to SignalK as notifications.

### Non-goals (v1)
- The frontend does **not** talk to SignalK directly. All data the UI consumes
  flows over the plugin's own REST API.
- No multi-vessel support; operates on `vessels.self`.
- No offline/PWA support.

---

## 2. Architecture & data flow

```
┌───────────────────────────────────────────────────────────────┐
│ Browser (React SPA, served from plugin /public)                 │
│   react-query ──REST (poll)──►                                  │
└───────────────┬─────────────────────────────────────────────────┘
                │  HTTP  /plugins/signalk-maintenance-tracker/api/*
                ▼
┌───────────────────────────────────────────────────────────────┐
│ Plugin backend (Node, in SignalK server process)               │
│   ├─ Express router (REST API)                                  │
│   ├─ Domain/service layer (due-date & status calc)             │
│   ├─ SQLite (better-sqlite3) in plugin data dir                 │
│   ├─ Runtime subscriber  ◄── SignalK deltas (read)             │
│   └─ Notification publisher ──► SignalK notifications (write)   │
└───────────────────────────────────────────────────────────────┘
                ▲                              │
                │ read runtime paths           │ notifications.maintenance.{slug}
                └──────────  SignalK server  ──┘
```

**Key boundary:** SignalK is an *internal backend concern only*. The backend reads
runtime values in and writes notifications out. Everything the frontend needs
(including current runtime and computed status) is exposed through the REST API.
"Live updating" in the UI means react-query polling the REST endpoints.

Later upgrade path (out of scope for v1): replace polling with a Server-Sent
Events endpoint on the backend; react-query can consume it without a SignalK
client in the browser.

---

## 3. Technology stack

### Backend
- **Language:** TypeScript, compiled to `dist/` via `tsc`.
- **Runtime:** Node (whatever the host SignalK server runs).
- **Database:** SQLite via **better-sqlite3** (synchronous, fast, zero external
  service — ideal on a Raspberry Pi). DB file lives in the plugin data directory.
- **HTTP:** Express `Router` provided by SignalK's `registerWithRouter(router)`.
- **Migrations:** simple in-code versioned migration runner (see §5.5).

### Frontend
| Concern | Library |
|---|---|
| Build / dev server | Vite + TypeScript |
| Framework | React 18 |
| Data table | @tanstack/react-table |
| Routing | react-router (HashRouter — see §7.1) |
| UI / modals / theming | Mantine |
| Markdown rendering | react-markdown + remark-gfm |
| Data + polling | @tanstack/react-query |
| Forms | @mantine/form |
| Dates | day.js |

---

## 4. Repository layout

```
signalk-maintenance-tracker/
├── package.json              # plugin manifest (backend deps + build scripts)
├── tsconfig.json             # backend TS config → dist/
├── src/                      # backend TypeScript source
│   ├── index.ts              # plugin entry (module.exports = function(app){...})
│   ├── config.ts             # plugin schema + typed options
│   ├── db/
│   │   ├── database.ts       # better-sqlite3 open + migrations
│   │   ├── migrations.ts
│   │   ├── tasks.repo.ts
│   │   ├── logs.repo.ts
│   │   └── tags.repo.ts
│   ├── domain/
│   │   ├── status.ts         # due-date / remaining / status calculations
│   │   └── slug.ts           # slug generation + uniqueness
│   ├── signalk/
│   │   ├── runtime.ts        # subscribe to runtime paths, cache values
│   │   └── notifications.ts  # publish notifications.maintenance.{slug}
│   └── api/
│       ├── router.ts         # mounts all routes
│       ├── tasks.routes.ts
│       ├── logs.routes.ts
│       ├── tags.routes.ts
│       └── signalk.routes.ts # path helpers (current value, candidate paths)
├── dist/                     # compiled backend (gitignored, published)
├── public/                   # built frontend (gitignored, published) → the webapp
├── frontend/                 # React app source
│   ├── package.json          # frontend deps (separate from plugin deps)
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx           # AppShell + routes + providers
│       ├── api/              # fetch client + react-query hooks
│       ├── pages/            # TaskList, TaskDetail, MasterLog
│       ├── components/       # tables, modals, MarkdownView, ThemeToggle
│       ├── hooks/
│       └── types.ts          # shared DTO types (kept in sync with backend)
└── docs/
    ├── initial-spec.md
    └── specification.md      # this file
```

Rationale for the split: the backend and frontend have entirely different
dependency trees and build steps. `frontend/` is a self-contained Vite project
that builds into the repo-root `public/` directory, which SignalK serves as the
webapp. The backend compiles `src/` → `dist/`.

---

## 5. Data model (SQLite)

All timestamps stored as ISO-8601 UTC strings (`TEXT`). Runtime values are hours
as `REAL`.

### 5.1 `tasks`
| column | type | notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| slug | TEXT UNIQUE NOT NULL | URL + notification identifier; immutable after create |
| name | TEXT NOT NULL | |
| description | TEXT | markdown |
| runtime_interval | REAL NULL | hours between required maintenance |
| time_interval | INTEGER NULL | magnitude of time interval |
| time_interval_unit | TEXT NULL | one of `days`,`weeks`,`months`,`years` |
| runtime_path | TEXT NULL | SignalK path, e.g. `propulsion.port.runTime` |
| last_maintenance | TEXT NULL | ISO timestamp of last completion (denormalized, see §5.6) |
| last_runtime | REAL NULL | runtime hours at last completion (denormalized) |
| created_at | TEXT NOT NULL | |
| updated_at | TEXT NOT NULL | |

Constraints/notes:
- At least one of (`runtime_interval`, `time_interval`) should be set; enforced in
  the API layer, not the DB (allow "informational only" tasks with neither if the
  user insists — see §11 open questions).
- `time_interval` + `time_interval_unit` are set/cleared together.

### 5.2 `tags`
| column | type | notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| name | TEXT UNIQUE NOT NULL | case-insensitive unique (store normalized) |

Tags are freeform, created on demand when assigned to a task, auto-pruned when no
task references them.

### 5.3 `task_tags`
| column | type | notes |
|---|---|---|
| task_id | INTEGER NOT NULL FK → tasks(id) ON DELETE CASCADE | |
| tag_id | INTEGER NOT NULL FK → tags(id) ON DELETE CASCADE | |
| PRIMARY KEY (task_id, tag_id) | | |

### 5.4 `log_entries`
| column | type | notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| task_id | INTEGER NOT NULL FK → tasks(id) ON DELETE CASCADE | |
| maintenance_date | TEXT NOT NULL | ISO timestamp of when maintenance was done |
| runtime_hours | REAL NULL | runtime at completion (if a runtime path exists) |
| notes | TEXT | markdown |
| logged_by | TEXT NULL | SignalK user identifier (see §9) |
| created_at | TEXT NOT NULL | |

Indexes: `idx_log_task_date (task_id, maintenance_date DESC)`, and a full-text or
`LIKE`-backed index consideration for notes search (v1: plain `LIKE`, see §6.3).

### 5.5 `runtime_cache`
Persists the last-seen runtime value per path so "current runtime" survives a
plugin restart and is available immediately.

| column | type | notes |
|---|---|---|
| path | TEXT PK | SignalK path |
| value | REAL NOT NULL | latest observed runtime hours |
| timestamp | TEXT NOT NULL | when observed |

### 5.6 Denormalization invariant
`tasks.last_maintenance` and `tasks.last_runtime` always equal the
`maintenance_date` / `runtime_hours` of the **most recent** `log_entries` row for
that task (by `maintenance_date`). On task creation the user may seed these
directly (starting point before any logged maintenance). Whenever a log entry is
inserted, updated, or deleted, the service layer recomputes these two columns from
the latest remaining log entry (or falls back to the seed values / null). This
keeps list queries fast without a correlated subquery per row.

### 5.7 `meta`
Single-row table (or key/value) holding `schema_version` for migrations. The
migration runner applies ordered migrations from `migrations.ts` and bumps the
version inside a transaction.

---

## 6. Domain logic

### 6.1 Current runtime
`current_runtime(task)` = latest value for `task.runtime_path` from the in-memory
runtime map (backed by `runtime_cache`), or `null` if no path / no value seen.

### 6.2 Computed fields (per task, computed on read — never stored except the
denormalized last_* values)

Given `now`:

Runtime dimension (only if `runtime_interval` and `runtime_path` and both
`last_runtime` and `current_runtime` are known):
- `elapsed_runtime = current_runtime - last_runtime`
- `remaining_runtime = runtime_interval - elapsed_runtime`
- `due_runtime_at = last_runtime + runtime_interval` (in runtime hours)
- `runtime_fraction = elapsed_runtime / runtime_interval` (for progress bars)

Time dimension (only if `time_interval` and `last_maintenance` are known):
- `due_date = last_maintenance + (time_interval, time_interval_unit)` — computed
  with calendar-aware date math (day.js `.add`), so "6 months" respects month
  lengths.
- `remaining_time_ms = due_date - now`
- `time_fraction = (now - last_maintenance) / (due_date - last_maintenance)`

### 6.3 Status
Each active dimension yields a sub-status; the task's overall status is the
**most urgent** of its dimensions:

| sub-status | condition |
|---|---|
| `overdue` | `remaining <= 0` |
| `due_soon` | not overdue AND within the lead window (runtime: `remaining_runtime <= runtimeNotifyLeadHours`; time: `remaining_time <= timeNotifyLeadDays`) |
| `ok` | otherwise |
| `unknown` | dimension configured but inputs missing (e.g. runtime path set but no value seen yet) |

Overall precedence: `overdue` > `due_soon` > `ok` > `unknown`. A sort key
(`status_rank` + soonest `remaining`) is emitted so the UI's default sort =
"past-due first, then upcoming" is a straightforward server-side ORDER BY on the
already-computed list.

### 6.4 Slug generation
`slugify(name)` → lowercase, ASCII-fold, replace non-alphanumerics with `-`,
collapse repeats, trim. Ensure uniqueness by appending `-2`, `-3`, … Slug is
generated once at create and is **immutable** thereafter (it is embedded in
notification paths and webapp URLs). Renaming the task does not change the slug.

---

## 7. Frontend

### 7.1 Serving & routing
The built SPA is served by SignalK at `/{pluginId}/` (i.e.
`/signalk-maintenance-tracker/`) because `package.json` includes the
`signalk-webapp` keyword and a `public/` directory.

- Vite `base: './'` so assets resolve relative to the mounted path.
- **HashRouter** is used so deep links and page refreshes work under the plugin
  mount without server-side SPA fallback (e.g.
  `/signalk-maintenance-tracker/#/tasks/oil-change`). BrowserRouter + `basename`
  is a documented alternative if SignalK's static handler is confirmed to fall
  back to `index.html`.
- API base URL: `/plugins/signalk-maintenance-tracker/api` (absolute path; the
  webapp and API share an origin).

### 7.2 Providers & shell
`App.tsx` wraps the tree in `MantineProvider` (with color scheme), a
`QueryClientProvider`, and Mantine's `ModalsProvider` + `Notifications`. The
`AppShell` header contains: app title, nav links (Tasks / Log), a global search
box, and the theme toggle.

### 7.3 Theme (light/dark)
- On first load, initialize color scheme from `prefers-color-scheme`.
- Persist the user's explicit choice to `localStorage`; explicit choice overrides
  the media query on subsequent loads.
- Toggle in the header cycles light/dark (Mantine `useMantineColorScheme`).

### 7.4 Pages

**Task List (`/`)** — the main page.
- TanStack Table + Mantine, columns: status badge, name, tags, remaining runtime,
  remaining time, next due date, action icons (view / edit / delete / complete).
- Default sort: overdue first, then due_soon, then upcoming — driven by the
  server's `status_rank` + remaining sort.
- Controls: freeform search box; tag filter (multi-select chips, select/deselect);
  column-header sorting (name, remaining runtime, remaining time); pagination.
- All list state (search, tags, sort, page) is held in URL query params so views
  are shareable/bookmarkable and survive refresh.
- Live-updating via react-query `refetchInterval` (default 5 s, configurable).

**Task Detail (`/tasks/:slug`)**
- Shows name, rendered markdown description, tags, both intervals, current
  elapsed/remaining runtime and time (with Mantine progress bars from
  `runtime_fraction` / `time_fraction`), next due date(s), and current status
  badge.
- A "Mark complete" button opening the Complete modal.
- A per-task log table with edit/delete actions on each entry.

**Master Log (`/log`)**
- One row per log entry across all tasks: task name (link), maintenance date,
  runtime hours, notes (truncated, expandable), logged_by.
- Sortable + searchable + paginated (server-side, same pattern as task list).

### 7.5 Modals
- **Task form (create/edit)** — fields: name (with live slug preview on create),
  markdown description (textarea with a preview toggle), tags (creatable
  multi-select fed by `GET /tags`), runtime interval (hours), time interval
  (number + unit select), runtime path (autocomplete from `GET
  /api/signalk/paths`, showing the current value when a path is chosen), and — on
  create only — optional seed `last_maintenance` / `last_runtime`.
- **Complete** — maintenance datetime (default now), runtime hours (prefilled from
  the current SignalK runtime value when a path is set), notes (markdown). Submits
  a new log entry (§8, `POST /tasks/:slug/logs`).
- **Delete confirm** — simple confirmation; on confirm calls `DELETE
  /tasks/:slug`.

### 7.6 Data layer
- A thin `fetch` wrapper (`api/client.ts`) prefixing the API base and handling
  JSON + error normalization.
- react-query hooks: `useTasks(params)`, `useTask(slug)`, `useLogs(params)`,
  `useTaskLogs(slug)`, `useTags()`; mutations `useCreateTask`, `useUpdateTask`,
  `useDeleteTask`, `useAddLog` (mark complete), `useUpdateLog`, `useDeleteLog`.
- Mutations invalidate the relevant queries (`tasks`, `task/:slug`, `logs`,
  `tags`) so the UI reflects changes immediately without waiting for the poll.

---

## 8. REST API

Base path (mounted by `registerWithRouter`):
`/plugins/signalk-maintenance-tracker/api`

All responses are JSON. Errors use `{ "error": { "code": string, "message":
string } }` with appropriate HTTP status codes. List endpoints return
`{ "data": [...], "total": n, "page": p, "pageSize": s }`.

### 8.1 Tasks
| Method | Path | Description |
|---|---|---|
| GET | `/tasks` | List tasks (paginated). Query: `search`, `tags` (csv), `status` (csv of overdue/due_soon/ok/unknown), `sort` (name\|remaining_runtime\|remaining_time\|status), `order` (asc\|desc), `page`, `pageSize`. Each item includes stored + computed fields (§6.2/6.3). Default sort = status urgency. |
| POST | `/tasks` | Create. Body below. Server generates slug. |
| GET | `/tasks/:slug` | Task detail incl. computed fields, tags, and recent log entries (or a link + `GET /tasks/:slug/logs`). |
| PUT | `/tasks/:slug` | Update editable fields (name, description, intervals, runtime_path, tags, seed last_* on tasks with no logs). Slug not changed. |
| DELETE | `/tasks/:slug` | Delete task + its log entries (cascade). Clears its notification. |

Task request body (create/update):
```json
{
  "name": "Engine oil change",
  "description": "Change oil and filter. **Use 15W-40.**",
  "runtime_interval": 200,
  "time_interval": 12,
  "time_interval_unit": "months",
  "runtime_path": "propulsion.port.runTime",
  "tags": ["Engines", "Port Engine"],
  "last_maintenance": "2026-01-15T10:00:00Z",
  "last_runtime": 1240.5
}
```

Task response object (list item / detail):
```json
{
  "id": 1,
  "slug": "engine-oil-change",
  "name": "Engine oil change",
  "description": "…",
  "tags": ["Engines", "Port Engine"],
  "runtime_interval": 200,
  "time_interval": 12,
  "time_interval_unit": "months",
  "runtime_path": "propulsion.port.runTime",
  "last_maintenance": "2026-01-15T10:00:00Z",
  "last_runtime": 1240.5,
  "current_runtime": 1360.0,
  "elapsed_runtime": 119.5,
  "remaining_runtime": 80.5,
  "due_runtime_at": 1440.5,
  "runtime_fraction": 0.5975,
  "due_date": "2027-01-15T10:00:00Z",
  "remaining_time_ms": 16675200000,
  "time_fraction": 0.48,
  "status": "ok",
  "status_rank": 2,
  "created_at": "…",
  "updated_at": "…"
}
```

### 8.2 Log entries
| Method | Path | Description |
|---|---|---|
| GET | `/logs` | Master log, paginated. Query: `search`, `sort` (maintenance_date\|task\|runtime_hours), `order`, `page`, `pageSize`. Each item includes `task_slug` + `task_name`. |
| GET | `/tasks/:slug/logs` | Log entries for one task. |
| POST | `/tasks/:slug/logs` | **Mark complete** — create a log entry. Recomputes task denormalized fields (§5.6) and refreshes the task's notification. `logged_by` is filled server-side from the request principal (§9), not the body. |
| PUT | `/logs/:id` | Edit a log entry. Recomputes task fields if it was/becomes the latest. |
| DELETE | `/logs/:id` | Delete a log entry. Recomputes task fields. |

Log create body (mark complete):
```json
{
  "maintenance_date": "2026-07-08T14:30:00Z",
  "runtime_hours": 1360.0,
  "notes": "Replaced filter, topped up coolant."
}
```

### 8.3 Tags
| Method | Path | Description |
|---|---|---|
| GET | `/tags` | All tags with usage counts, for filter chips + autocomplete. |

Tags are created/removed implicitly through task create/update. (A `DELETE
/tags/:id` may be added later for manual cleanup; v1 auto-prunes orphans.)

### 8.4 SignalK helpers (read-only, for the editor UI)
| Method | Path | Description |
|---|---|---|
| GET | `/signalk/paths` | Candidate runtime paths to populate the runtime-path autocomplete (paths under self that look numeric / contain `runTime` etc.). |
| GET | `/signalk/value?path=…` | Current value of a self path, for the editor's "current value" preview and the Complete modal prefill. |

### 8.5 Status/health
| Method | Path | Description |
|---|---|---|
| GET | `/health` | Plugin status: db task/log counts, subscribed runtime paths, last recompute tick, plugin version. |

---

## 9. Authentication & user identity

The plugin relies on the SignalK server's security. When server security is
enabled, requests routed through the plugin router carry the authenticated
principal (e.g. `req.skPrincipal?.identifier`). `POST /tasks/:slug/logs` fills
`log_entries.logged_by` from that principal server-side (ignoring any client-sent
value). When security is disabled or no principal is present, `logged_by` falls
back to `null` / `"anonymous"`.

The exact principal accessor is confirmed against the running server during
implementation; the service layer isolates it behind a single
`getRequestUser(req)` helper so the rest of the code is decoupled from the SignalK
security detail.

---

## 10. SignalK integration (backend)

### 10.1 Plugin lifecycle
Standard SignalK plugin shape:

```ts
module.exports = function (app) {
  const plugin = {
    id: 'signalk-maintenance-tracker',
    name: 'Maintenance Tracker',
    description: 'Track recurring boat maintenance tasks.',
    schema,                    // §10.4
    start(options) { … },      // open db, run migrations, subscribe, mount timers
    stop() { … },              // unsubscribe, clear timers, close db
    registerWithRouter(router) { mountApi(router, services) },  // §8
  }
  return plugin
}
```

- DB path: `path.join(app.getDataDirPath(), 'maintenance.sqlite3')`.
- `app.setPluginStatus(...)` / `app.setPluginError(...)` to surface state in the
  admin UI; `app.debug(...)` for logging.

### 10.2 Runtime subscription (read)
On start (and whenever a task's `runtime_path` changes), subscribe to the union of
all task runtime paths on `vessels.self` via SignalK's subscription manager /
`streambundle`. Each delta updates the in-memory runtime map and upserts
`runtime_cache`. Subscriptions are torn down and rebuilt when the set of paths
changes (task create/update/delete).

### 10.3 Notifications (write)
A periodic recompute tick (default 60 s, configurable) plus event-driven
recompute (on task change, log change, or runtime update) evaluates each task's
status and publishes a delta to `notifications.maintenance.{slug}`:

```ts
app.handleMessage(plugin.id, {
  updates: [{
    values: [{
      path: `notifications.maintenance.${slug}`,
      value: {
        state: 'alarm' | 'warn' | 'normal',   // overdue | due_soon | ok
        method: options.notificationMethods,  // e.g. ['visual']
        message: 'Engine oil change is overdue by 20 runtime hours',
        timestamp: nowIso,
      }
    }]
  }]
})
```

Mapping: `overdue → alarm`, `due_soon → warn`, `ok → normal` (which clears the
alarm). `unknown` publishes nothing (or clears). Notifications are only published
when `enableNotifications` is true and when a task's state changes (to avoid delta
spam); a task with both dimensions publishes one notification reflecting the more
urgent dimension, with the message naming which dimension triggered it.

> Note on path: SignalK's notification tree is `notifications.*` (plural). The
> initial spec wrote `notification.maintenance.{slug}.*`; this spec uses the
> SignalK-correct `notifications.maintenance.{slug}`. Splitting into
> `…/{slug}/runtime` and `…/{slug}/time` sub-paths is a possible future refinement.

### 10.4 Plugin config schema
Exposed in the SignalK admin UI (`plugin.schema`):

| option | type | default | purpose |
|---|---|---|---|
| `enableNotifications` | boolean | true | master switch for notification publishing |
| `notificationMethods` | string[] | `["visual"]` | SignalK notification `method` |
| `runtimeNotifyLeadHours` | number | 10 | runtime lead window for `due_soon`/warn |
| `timeNotifyLeadDays` | number | 7 | time lead window for `due_soon`/warn |
| `recomputeIntervalMs` | number | 60000 | backend status-recompute tick |

(Per-task runtime paths are stored with the tasks, not in plugin config, so the
subscription set is derived from the DB.)

---

## 11. Open questions / decisions to confirm during build
- **Tasks with neither interval:** allow purely informational tasks, or require at
  least one interval? (Current plan: require ≥1, enforced in API.)
- **Runtime path unit assumptions:** confirm the SignalK runtime paths are in
  seconds vs hours and normalize on read (SignalK `propulsion.*.runTime` is
  seconds per spec → convert to hours internally).
- **Slug on rename:** kept immutable in v1. Revisit if users want tidy URLs after
  renames (would require notification path migration).
- **Search backend:** v1 uses `LIKE` across name/description/tags/notes. If it gets
  slow, move to SQLite FTS5.
- **Deep-link routing:** confirm whether SignalK's static webapp handler falls back
  to `index.html`; if so, switch HashRouter → BrowserRouter + basename.
- **Principal accessor:** confirm the exact `req` field for the authenticated user.

---

## 12. Build, packaging & deployment

### 12.1 package.json (plugin manifest) — key fields
```jsonc
{
  "name": "signalk-maintenance-tracker",
  "version": "0.1.0",
  "main": "dist/index.js",
  "keywords": ["signalk-node-server-plugin", "signalk-webapp"],
  "scripts": {
    "build:backend": "tsc",
    "build:frontend": "npm --prefix frontend run build",
    "build": "npm run build:backend && npm run build:frontend",
    "watch:backend": "tsc -w",
    "clean": "rimraf dist public"
  },
  "files": ["dist/", "public/"],
  "dependencies": { "better-sqlite3": "…" },
  "devDependencies": { "typescript": "…", "@types/better-sqlite3": "…" }
}
```
- `frontend/` build output goes to `../public` (set `build.outDir` in
  `vite.config.ts`).
- Published package ships compiled `dist/` (backend) and `public/` (webapp); both
  are gitignored but included via `files`.

### 12.2 Dev workflow
- Backend: `npm run watch:backend`, then restart the plugin from the SignalK admin
  UI (or run SignalK from a checkout with the plugin linked via `npm link`).
- Frontend: `npm --prefix frontend run dev` with a Vite proxy forwarding
  `/plugins/signalk-maintenance-tracker/api` (and `/signalk`) to the running
  SignalK server, for hot-reload development against live data.

### 12.3 Install (end user)
Via the SignalK Appstore (once published) or `npm install` into the server's
plugin directory. The webapp then appears in the SignalK Webapps menu.

---

## 13. Phased implementation plan

1. **Scaffold** — repo layout, `package.json`, `tsconfig`, plugin entry that
   loads and appears in the admin UI; empty Express router mounted.
2. **DB + domain** — schema, migrations, repositories, slug + status calculators
   with unit tests.
3. **Task/log/tag REST API** — full CRUD + list filtering/sorting/pagination
   (no SignalK integration yet; runtime/current values null).
4. **SignalK read** — runtime subscription + cache; `current_runtime` and runtime
   computed fields populated; `/signalk/*` helper endpoints.
5. **Notifications** — recompute tick + publishing with lead-window config.
6. **Frontend scaffold** — Vite + Mantine + react-query + routing + theme,
   building into `public/`.
7. **Task list page** — table, search, tag filter, sort, pagination, polling.
8. **Task detail + modals** — detail page, create/edit/complete/delete modals.
9. **Master log page.**
10. **Polish** — empty/loading/error states, responsive layout, accessibility,
    docs/README, appstore metadata.
```
