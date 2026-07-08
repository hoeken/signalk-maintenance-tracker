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
- Use the SignalK server's own authentication and access control. The webapp
  offers login/logout and gates its editing UI behind the logged-in state; the
  server (not the plugin) enforces who may call which endpoint (§7.7, §9).

### Non-goals (v1)
- The frontend does **not** talk to SignalK directly for *domain data* — all task,
  log, and tag data flows over the plugin's own REST API. (The one exception is
  auth: login/logout/validate call SignalK's native `/signalk/v1/auth/*`
  endpoints, §7.7.)
- The plugin builds **no** authorization of its own — SignalK enforces API access
  (§9).
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
│   ├─ SQLite (node:sqlite) in plugin data dir                    │
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

---

## 3. Technology stack

### Backend
- **Language:** TypeScript, compiled to `dist/` via `tsc`.
- **Runtime:** Node (whatever the host SignalK server runs).
- **Database:** SQLite via Node's built-in **`node:sqlite`** (`DatabaseSync` —
  synchronous, fast, and zero native compilation / zero external dependency, which
  is ideal on a Raspberry Pi). DB file lives in the plugin data directory.
  **Requires Node ≥ 22.5** (where `node:sqlite` first shipped); target Node 24+.
  The module is still marked *experimental* by Node, so the plugin declares an
  `engines.node` floor (§12.1) and opening the DB tolerates the
  `ExperimentalWarning`. See §5.8 for the API notes that differ from
  `better-sqlite3`.
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
│   │   ├── database.ts       # node:sqlite DatabaseSync open + migrations
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
│   ├── auth.ts               # getRequestUser(req) — reads the SignalK principal (for logged_by)
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
│       ├── auth/             # AuthProvider/useAuth + SignalK /signalk/v1/auth/* client
│       ├── pages/            # TaskList, TaskDetail, MasterLog
│       ├── components/       # tables, modals, MarkdownView, ThemeToggle, LoginModal, AuthControl
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
| slug | TEXT UNIQUE NOT NULL | URL + notification identifier; auto-generated on first save, user-editable thereafter |
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
- Both intervals are optional and independent. A task with neither is a valid
  **informational-only** task (it still tracks name/description/tags/logs but has
  no due-date or runtime status). No API-layer enforcement of "at least one".
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

Indexes: `idx_log_task_date (task_id, maintenance_date DESC)`. Search uses plain
`LIKE` (§6.3); at the expected scale (well under ~200 tasks) no full-text index is
needed.

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
version inside a transaction (opened explicitly with `db.exec('BEGIN')` /
`COMMIT` / `ROLLBACK` — see §5.8; `node:sqlite` has no `db.transaction()`
wrapper).

### 5.8 `node:sqlite` API notes
The DB layer targets Node's built-in `node:sqlite`. It is close to
`better-sqlite3` in spirit (synchronous, prepared statements) but differs in a
few ways the repositories must respect:

- **Open:** `import { DatabaseSync } from 'node:sqlite';` then
  `const db = new DatabaseSync(dbPath);`.
- **Statements:** `db.prepare(sql)` → a `StatementSync` with `.get(...params)`,
  `.all(...params)`, `.run(...params)` (returns `{ changes, lastInsertRowid }`),
  and `.iterate(...)`. `db.exec(sql)` runs multi-statement SQL (schema/migrations).
- **Parameters:** positional `?` or named (`:name` / `$name` / `@name`) bound by
  passing a single object, e.g. `stmt.run({ name })`.
- **Transactions:** no `db.transaction(fn)` helper — wrap work manually in
  `db.exec('BEGIN')` … `COMMIT` / `ROLLBACK` (used by the migration runner and by
  the multi-write log-completion path in §5.6).
- **Pragmas:** no `db.pragma()` helper — use `db.exec('PRAGMA journal_mode = WAL')`
  etc.
- **Foreign keys / cascade:** the `ON DELETE CASCADE` rules in §5.3/§5.4 depend on
  FK enforcement, which `DatabaseSync` enables by default
  (`enableForeignKeyConstraints: true`). Leave it on.

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
collapse repeats, trim. Ensure uniqueness by appending `-2`, `-3`, …

The slug is **auto-generated once, on first save** (create), from the name. After
that it is **user-editable**: the create form shows a live slug preview, and the
edit form exposes the slug as an editable field. Renaming the task does *not*
auto-regenerate the slug — only an explicit slug edit changes it.

On any slug change the server:
- normalizes the submitted value through `slugify` and re-checks uniqueness
  (rejecting a collision, or auto-suffixing — see §8.1);
- migrates the notification path: clears `notifications.maintenance.{oldSlug}`
  (publishes a cleared/normal state) and republishes under
  `notifications.maintenance.{newSlug}` on the next recompute.

Because the slug is embedded in webapp URLs, an old deep link (`#/tasks/{oldSlug}`)
stops resolving after a rename; this is acceptable in v1.

---

## 7. Frontend

### 7.1 Serving & routing
The built SPA is served by SignalK at `/{pluginId}/` (i.e.
`/signalk-maintenance-tracker/`) because `package.json` includes the
`signalk-webapp` keyword and a `public/` directory.

- Vite `base: './'` so assets resolve relative to the mounted path.
- **HashRouter** is used (confirmed choice) so deep links and page refreshes work
  under the plugin mount without any server-side SPA fallback — everything after
  the `#` is client-side only and never hits the server (e.g.
  `/signalk-maintenance-tracker/#/tasks/oil-change`). SignalK serves the app at
  both `/signalk-maintenance-tracker/` and `/signalk-maintenance-tracker/index.html`,
  which is all HashRouter requires. (BrowserRouter + `basename` would need the
  static handler to fall back to `index.html` for unknown deep paths; not relied
  on.)
- API base URL: `/plugins/signalk-maintenance-tracker/api` (absolute path; the
  webapp and API share an origin). Because they are same-origin, the SignalK
  session cookie set at login is sent automatically with every API request
  (fetch `credentials: 'same-origin'`); no manual token handling is required for
  the common case (§7.7, §9).

### 7.2 Providers & shell
`App.tsx` wraps the tree in `MantineProvider` (with color scheme), a
`QueryClientProvider`, an `AuthProvider` (§7.7), and Mantine's `ModalsProvider` +
`Notifications`. The `AppShell` header contains: app title, nav links (Tasks /
Log), a global search box, the theme toggle, and an **auth control** (`AuthControl`)
— a "Log in" link when anonymous, or the username + "Log out" when authenticated.

### 7.3 Theme (light/dark)
- On first load, initialize color scheme from `prefers-color-scheme`.
- Persist the user's explicit choice to `localStorage`; explicit choice overrides
  the media query on subsequent loads.
- Toggle in the header cycles light/dark (Mantine `useMantineColorScheme`).

### 7.4 Pages

**Task List (`/`)** — the main page.
- TanStack Table + Mantine, columns: status badge, name, tags, remaining runtime,
  remaining time, next due date, action icons. `view` is always shown; the write
  actions (`edit` / `delete` / `complete`) and the "New task" button are rendered
  only when logged in (§7.7). Logged-out visitors see the data and the `view`
  action.
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
- **Task form (create/edit)** — fields: name; slug (on create, shown as a live
  preview derived from name but editable; on edit, an editable field that warns
  the change breaks existing deep links, §6.4); markdown description (textarea
  with a preview toggle), tags (creatable
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
  JSON + error normalization. It sends `credentials: 'same-origin'` so the SignalK
  session cookie rides along (§7.7). On any `401`/`403` it marks the session
  logged-out and prompts re-login (Mantine notification + `openLoginModal()`) —
  covering both an expired session on a write and (given today's admin-only API)
  reads made while logged out.
- react-query hooks: `useTasks(params)`, `useTask(slug)`, `useLogs(params)`,
  `useTaskLogs(slug)`, `useTags()`; mutations `useCreateTask`, `useUpdateTask`,
  `useDeleteTask`, `useAddLog` (mark complete), `useUpdateLog`, `useDeleteLog`.
- Mutations invalidate the relevant queries (`tasks`, `task/:slug`, `logs`,
  `tags`) so the UI reflects changes immediately without waiting for the poll.

### 7.7 Authentication (frontend)
The webapp logs the user in against the **SignalK server's own** auth endpoints
([SignalK security spec](https://signalk.org/specification/1.8.2/doc/security.html));
it does not manage credentials or authorization itself. The plugin webapp is
served same-origin with the server, so the session cookie SignalK sets at login is
sent automatically with every subsequent request (API calls and validate/logout).

- **`AuthProvider` / `useAuth()`** (`auth/`) holds the login state and exposes
  `{ isLoggedIn, username, login(username, password), logout(), openLoginModal() }`.
  On mount it establishes the initial state by calling
  `POST /signalk/v1/auth/validate` (200 ⇒ logged in, 401 ⇒ logged out). It also
  re-validates before the token's `timeToLive` elapses to keep the session fresh.
- **Login** — `POST /signalk/v1/auth/login` with `{ username, password }`. On
  success (200) SignalK sets the session cookie and returns `{ token, timeToLive }`;
  the provider records `timeToLive` for renewal and the entered `username` for
  display, and flips `isLoggedIn`. A 401 shows an inline "invalid credentials"
  error in the modal.
- **Logout** — `PUT /signalk/v1/auth/logout`; clears local state regardless of
  outcome.
- **`LoginModal`** — a Mantine modal with username + password fields and inline
  error. Opened from the header `AuthControl`, and also auto-opened when an API
  call returns `401` (see §7.6).
- **`AuthControl`** (header) — "Log in" when logged out; the username + a "Log out"
  action when logged in.
- **Gating rule (single source of truth):** every affordance that triggers a
  write endpoint is rendered only when `isLoggedIn` — the "New task" button, the
  task list `edit`/`delete`/`complete` action icons, the edit/complete/delete
  buttons on Task Detail, and the Task form / Complete / Delete modals. Read UI
  (lists, detail, master log, search, filter, sort) is unconditional. UI gating is
  only UX; the server is the actual authority (§9).

> **Token vs cookie:** relying on the same-origin session cookie is the primary
> mechanism, so the client does not need to persist the bearer token. (If a
> deployment is found where the cookie isn't usable, the returned `token` can be
> stored and attached as `Authorization: Bearer <token>` — the spec supports both.)

> **Current-server caveat:** today SignalK requires *admin* credentials for **all**
> plugin API routes, so in practice a user must log in (as admin) to load *any*
> data. The logged-out read-only experience becomes real once SignalK enforces
> per-route permission levels (§9); the gating above is already written for that
> future and needs no change when it lands.

---

## 8. REST API

Base path (mounted by `registerWithRouter`):
`/plugins/signalk-maintenance-tracker/api`

All responses are JSON. Errors use `{ "error": { "code": string, "message":
string } }` with appropriate HTTP status codes. List endpoints return
`{ "data": [...], "total": n, "page": p, "pageSize": s }`.

**Access control:** enforced by SignalK, not the plugin. Requests carry the
server's session (cookie or bearer token); SignalK decides who may reach these
routes and returns `401`/`403` itself. Today that means *admin* is required for
all routes below; a future SignalK release will let the plugin declare a
per-route permission level (read for `GET`, write for mutations). The handlers
assume authorization has already passed and never re-check it (§9).

### 8.1 Tasks
| Method | Path | Description |
|---|---|---|
| GET | `/tasks` | List tasks (paginated). Query: `search`, `tags` (csv), `status` (csv of overdue/due_soon/ok/unknown), `sort` (name\|remaining_runtime\|remaining_time\|status), `order` (asc\|desc), `page`, `pageSize`. Each item includes stored + computed fields (§6.2/6.3). Default sort = status urgency. |
| POST | `/tasks` | Create. Body below. Server generates slug. |
| GET | `/tasks/:slug` | Task detail incl. computed fields, tags, and recent log entries (or a link + `GET /tasks/:slug/logs`). |
| PUT | `/tasks/:slug` | Update editable fields (name, description, intervals, runtime_path, tags, seed last_* on tasks with no logs). May also change `slug` (normalized + uniqueness-checked; triggers notification-path migration, §6.4). |
| DELETE | `/tasks/:slug` | Delete task + its log entries (cascade). Clears its notification. |

Task request body (create/update). `slug` is optional: omit it on create to
auto-generate from `name`; include it (on create or update) to set/change it
explicitly. `runtime_interval` / `time_interval` are both optional (§5.1).
```json
{
  "name": "Engine oil change",
  "slug": "engine-oil-change",
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
| GET | `/signalk/value?path=…` | Current value of a self path, for the editor's "current value" preview and the Complete modal prefill. For runtime paths this returns the **hours-converted** value (§10.2) so previews/prefills match stored `runtime_hours`. |

### 8.5 Status/health
| Method | Path | Description |
|---|---|---|
| GET | `/health` | Plugin status: db task/log counts, subscribed runtime paths, last recompute tick, plugin version. |

### 8.6 Auth
The plugin exposes **no** auth endpoints. The webapp authenticates directly
against the SignalK server's native endpoints (same origin):

| Method | Path | Purpose |
|---|---|---|
| POST | `/signalk/v1/auth/login` | Log in with `{ username, password }`; returns `{ token, timeToLive }` and sets the session cookie. |
| POST | `/signalk/v1/auth/validate` | Check/renew the session (200 = logged in, 401 = not); used for initial state + token refresh. |
| PUT | `/signalk/v1/auth/logout` | Log out; clears the session. |

See §7.7 for the frontend flow and §9 for how these gate the plugin's own routes.

---

## 9. Authentication & access control (backend)

**The plugin builds no authorization of its own.** Access control is entirely the
SignalK server's responsibility:

- **Today:** SignalK requires *admin* credentials for every route registered via
  `registerWithRouter`. So all plugin endpoints (reads included) are admin-only,
  enforced by the server before a request ever reaches a handler.
- **Future:** a planned SignalK release lets a plugin declare the required
  permission level per route (read for `GET`, write for mutations); SignalK will
  enforce it and the logged-out read-only experience (§7.7) becomes real. This is
  expected to need only a small route-annotation change here, not a new auth
  layer.

Consequently the route handlers assume authorization has already passed and never
re-check it — no `requireWrite`, no permission logic in the plugin.

### 9.1 User identity on records
The one thing the backend still *reads* from the session is the caller's identity,
to stamp `log_entries.logged_by`. `getRequestUser(req)` (`src/auth.ts`) returns the
request principal's identifier (e.g. `req.skPrincipal?.identifier`) or `null`.
`POST /tasks/:slug/logs` fills `logged_by` from it server-side (ignoring any
client-sent value); when absent it falls back to `null` / `"anonymous"`.

> The exact principal field is confirmed against the running server during
> implementation; it is isolated in `auth.ts`, so adjusting it touches one file.
> This is reading identity, not enforcing access.

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

- DB path: `path.join(app.getDataDirPath(), 'maintenance.db')`.
- `app.setPluginStatus(...)` / `app.setPluginError(...)` to surface state in the
  admin UI; `app.debug(...)` for logging.

### 10.2 Runtime subscription (read)
On start (and whenever a task's `runtime_path` changes), subscribe to the union of
all task runtime paths on `vessels.self` via SignalK's subscription manager /
`streambundle`. Each delta updates the in-memory runtime map and upserts
`runtime_cache`. Subscriptions are torn down and rebuilt when the set of paths
changes (task create/update/delete).

**Units:** SignalK runtime paths (e.g. `propulsion.*.runTime`) are in **seconds**.
The subscriber converts to **hours** (`value / 3600`) on read, so everything the
DB, domain logic, and API deal in is hours (`runtime_cache.value`,
`last_runtime`, `runtime_interval`, computed `elapsed/remaining_runtime`). This is
the single conversion boundary; no other layer touches seconds.

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

## 11. Resolved decisions
These were open during drafting and are now settled:

- **Tasks with neither interval:** allowed. Both intervals are optional; a task
  with neither is a valid informational-only task. No "≥1 interval" enforcement.
  (§5.1)
- **Runtime path units:** SignalK runtime paths are in **seconds**. The runtime
  subscriber converts to hours (`/3600`) on read; everything above that boundary
  is hours. (§10.2)
- **Slug editing:** slug is auto-generated on first save (create) and is
  **user-editable** thereafter; renaming the task does not regenerate it. A slug
  change re-checks uniqueness and migrates the notification path. (§6.4, §8.1)
- **Search backend:** plain `LIKE` across name/description/tags/notes. Expected
  scale is < ~200 records, so no FTS5 needed. (§5.4, §6.3)
- **Deep-link routing:** **HashRouter** (confirmed). The app is served at both
  `/signalk-maintenance-tracker/` and `…/index.html`; HashRouter needs no
  server-side SPA fallback. (§7.1)
- **Access control:** owned entirely by SignalK — the plugin builds no authz.
  Today all plugin routes are admin-only; a future SignalK release adds per-route
  permission levels. The webapp does login/logout/validate against SignalK's
  native `/signalk/v1/auth/*` endpoints and gates its editing UI on the logged-in
  state. (§7.7, §8.6, §9)
- **Principal accessor:** a build-time detail only, used solely to stamp
  `logged_by`. The exact `req` field is confirmed against the running server and
  isolated behind `getRequestUser(req)`. (§9.1)

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
  "engines": { "node": ">=22.5" },
  "dependencies": {},
  "devDependencies": { "typescript": "…", "@types/node": "…" }
}
```
- No runtime DB dependency: `node:sqlite` is part of Node itself (no
  `better-sqlite3`, no native build step). `engines.node` enforces the ≥22.5 floor
  the module requires; `@types/node` supplies its type definitions.
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
