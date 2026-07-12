# signalk-maintenance-tracker — Implementation Specification

Status: draft v1
Supersedes the high-level [initial-spec.md](initial-spec.md) with concrete implementation detail.

---

## 1. Overview

A SignalK server plugin that tracks recurring boat maintenance tasks (oil changes,
winch service, watermaker maintenance, etc.). Each task has runtime- and/or
time-based intervals, a completion log, and freeform tag categories. The plugin
serves a Preact single-page webapp for managing tasks and viewing overdue/upcoming
maintenance. The webapp is **buildless** (native ES modules, no bundler required)
and targets a browser floor of **Chromium 69** so it runs on Navico/B&G MFDs, while
progressively enhancing on modern browsers (§7.9).

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

- The frontend does **not** talk to SignalK directly for _domain or runtime data_ —
  all task, log, and tag data (and every runtime value the UI shows) flows over the
  plugin's own REST API. There are two read-only, **non-domain** exceptions that
  call SignalK's native REST directly: auth (login/logout via
  `/signalk/v1/auth/*` and session status via `/skServer/loginStatus`, §7.7) and
  discovering candidate runtime-path _names_ for
  the task editor (`/signalk/v1/api/vessels/self`, §8.4).
- The plugin builds **no** authorization of its own — SignalK enforces API access
  (§9).
- No multi-vessel support; operates on `vessels.self`.
- No offline/PWA support.

---

## 2. Architecture & data flow

```
┌───────────────────────────────────────────────────────────────┐
│ Browser (Preact SPA, buildless ES modules, served from /public) │
│   signals data layer ──REST (poll)──►                           │
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

**Key boundary:** SignalK is an _internal backend concern_ for all domain and
runtime _data_. The backend reads runtime values in and writes notifications out,
and everything the frontend needs (including current runtime and computed status)
is exposed through the plugin REST API. "Live updating" in the UI means the data
layer polling the REST endpoints (§7.6). The frontend touches SignalK's native REST directly in
only two read-only, non-domain cases: authentication (`/signalk/v1/auth/*`, §7.7)
and discovering candidate runtime-path _names_ for the task editor
(`/signalk/v1/api/vessels/self`, §8.4) — never as a source of runtime values.

---

## 3. Technology stack

### Backend

- **Language:** TypeScript, compiled to `dist/` via `tsc`.
- **Runtime:** Node (whatever the host SignalK server runs).
- **Database:** SQLite via Node's built-in **`node:sqlite`** (`DatabaseSync` —
  synchronous, fast, and zero native compilation / zero external dependency, which
  is ideal on a Raspberry Pi). DB file lives in the plugin data directory.
  **Requires Node ≥ 22.5** (where `node:sqlite` first shipped); target Node 24+.
  The module is still marked _experimental_ by Node, so the plugin declares an
  `engines.node` floor (§12.1) and opening the DB tolerates the
  `ExperimentalWarning`. See §5.8 for the API notes that differ from
  `better-sqlite3`.
- **HTTP:** Express `Router` provided by SignalK's `registerWithRouter(router)`.
- **Migrations:** simple in-code versioned migration runner (see §5.5).

### Frontend

The frontend is a **buildless Preact app**: native ES modules authored to run
directly in the browser with **no bundler and no transpile step of our own**. The
browser floor is **Chromium 69** (Navico/B&G MFDs); everything degrades gracefully
up to modern browsers (§7.9). See §7.9 for the compatibility rules that constrain
every library choice below.

| Concern                     | Library / approach                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework                   | **Preact 10** (React-compatible hooks, ~4 KB, conservative ES2015 dist)                                                                                 |
| Templating                  | **htm** (JSX-like tagged template literals — no JSX/compile step)                                                                                       |
| Reactivity / data + polling | **@preact/signals** + a small hand-rolled resource/polling layer (§7.6)                                                                                 |
| Routing                     | **preact-router** (hash mode — see §7.1) or a tiny hand-rolled hash router                                                                              |
| Data table                  | **hand-rolled** (the sort/filter/paginate rules in §7.4 are specific; avoids a heavy dep)                                                               |
| UI / modals / theming       | **hand-rolled components + plain CSS** on a Chromium-69-safe baseline (§7.3, §7.9). No component library.                                               |
| Markdown rendering          | **snarkdown** (~1 KB) with output sanitized before insertion                                                                                            |
| Iconography                 | **Bootstrap Icons** — vendored CSS + woff2 webfont, used via `<i class="bi bi-…">`. All UI icons come from this set.                                    |
| Forms                       | **hand-rolled** controlled inputs + a small validation helper                                                                                           |
| Dates                       | **day.js** (small, ES5-safe; used for calendar-aware month math, §6.2)                                                                                  |
| Type-checking (dev only)    | TypeScript in **`--noEmit` / `checkJs`** mode over JSDoc-annotated `.js` — types are checked, never emitted, so there is no build artifact to transpile |
| Testing (dev only)          | **vitest** + **@testing-library/preact** (jsdom)                                                                                                        |

**Dependency delivery:** the handful of runtime libraries (preact, htm,
@preact/signals, preact-router, snarkdown, day.js) are **vendored as ESM files**
under `public/vendor/` and imported by explicit relative paths. Import maps are
**not** used (they require Chrome 89+); bare-specifier imports are therefore
avoided. Bootstrap Icons is vendored the same way — its stylesheet plus the woff2
font file live under `public/vendor/` and are loaded via a `<link>` in
`index.html`. Pinned vendor copies mean the app has no runtime CDN dependency —
important for an offline vessel network.

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
│       └── tags.routes.ts
├── dist/                     # compiled backend (gitignored, published)
├── public/                   # the webapp, served as-is by SignalK (published)
│   ├── index.html            # loads app/main.js as <script type="module">
│   ├── vendor/               # pinned ESM copies of preact, htm, signals, router, snarkdown, day.js
│   │                         #   + bootstrap-icons.css and its woff2 font
│   ├── app/                  # application ES modules (authored, shipped unchanged)
│   │   ├── main.js           # app root: mounts <App/>, sets up router + theme
│   │   ├── app.js            # shell: header (nav, search, theme toggle, auth control) + routes
│   │   ├── api/              # fetch client + signals-backed resource hooks
│   │   ├── auth/             # useAuth + SignalK /signalk/v1/auth/* client
│   │   ├── pages/            # TaskList, TaskDetail, MasterLog
│   │   ├── components/       # Table, modals, MarkdownView, ThemeToggle, LoginModal, AuthControl
│   │   └── lib/              # slug, format, small helpers
│   └── styles/               # plain CSS (Chromium-69-safe baseline, theme tokens)
├── frontend/                 # dev-only tooling for the webapp (NOT shipped)
│   ├── package.json          # dev deps: typescript, vitest, @testing-library/preact
│   ├── tsconfig.json         # checkJs / noEmit — type-checks public/app/**/*.js
│   └── test/                 # co-located *.test.js also allowed under public/app/
└── docs/
    ├── initial-spec.md
    └── specification.md      # this file
```

Rationale for the split: the backend still compiles `src/` → `dist/` via `tsc`.
The frontend, by contrast, has **no build output** — the files under `public/`
(hand-written ES modules + vendored deps + CSS) are exactly what ships and what the
browser runs. `frontend/` holds only _dev-time_ tooling (type-checking and tests)
that never produces a runtime artifact. End users' reverse-proxy plugin transpiles
the served JS/CSS for old browsers on the fly (§7.9); nothing here depends on a
bundler.

---

## 5. Data model (SQLite)

All timestamps stored as ISO-8601 UTC strings (`TEXT`). Runtime values are hours
as `REAL`.

### 5.1 `tasks`

| column             | type                     | notes                                                                                 |
| ------------------ | ------------------------ | ------------------------------------------------------------------------------------- |
| id                 | INTEGER PK AUTOINCREMENT |                                                                                       |
| slug               | TEXT UNIQUE NOT NULL     | URL + notification identifier; auto-generated on first save, user-editable thereafter |
| name               | TEXT NOT NULL            |                                                                                       |
| description        | TEXT                     | markdown                                                                              |
| runtime_interval   | REAL NULL                | hours between required maintenance                                                    |
| time_interval      | INTEGER NULL             | magnitude of time interval                                                            |
| time_interval_unit | TEXT NULL                | one of `days`,`weeks`,`months`,`years`                                                |
| runtime_path       | TEXT NULL                | SignalK path, e.g. `propulsion.port.runTime`                                          |
| last_maintenance   | TEXT NULL                | ISO timestamp of last completion (denormalized, see §5.6)                             |
| last_runtime       | REAL NULL                | runtime hours at last completion (denormalized)                                       |
| created_at         | TEXT NOT NULL            |                                                                                       |
| updated_at         | TEXT NOT NULL            |                                                                                       |

Constraints/notes:

- Both intervals are optional and independent. A task with neither is a valid
  **informational-only** task (it still tracks name/description/tags/logs but has
  no due-date or runtime status). No API-layer enforcement of "at least one".
- `time_interval` + `time_interval_unit` are set/cleared together.

### 5.2 `tags`

| column | type                     | notes                                      |
| ------ | ------------------------ | ------------------------------------------ |
| id     | INTEGER PK AUTOINCREMENT |                                            |
| name   | TEXT UNIQUE NOT NULL     | case-insensitive unique (store normalized) |

Tags are freeform, created on demand when assigned to a task, auto-pruned when no
task references them.

### 5.3 `task_tags`

| column                        | type                                              | notes |
| ----------------------------- | ------------------------------------------------- | ----- |
| task_id                       | INTEGER NOT NULL FK → tasks(id) ON DELETE CASCADE |       |
| tag_id                        | INTEGER NOT NULL FK → tags(id) ON DELETE CASCADE  |       |
| PRIMARY KEY (task_id, tag_id) |                                                   |       |

### 5.4 `log_entries`

| column           | type                                              | notes                                            |
| ---------------- | ------------------------------------------------- | ------------------------------------------------ |
| id               | INTEGER PK AUTOINCREMENT                          |                                                  |
| task_id          | INTEGER NOT NULL FK → tasks(id) ON DELETE CASCADE |                                                  |
| maintenance_date | TEXT NOT NULL                                     | ISO timestamp of when maintenance was done       |
| runtime_hours    | REAL NULL                                         | runtime at completion (if a runtime path exists) |
| notes            | TEXT                                              | markdown                                         |
| logged_by        | TEXT NULL                                         | SignalK user identifier (see §9)                 |
| created_at       | TEXT NOT NULL                                     |                                                  |

Indexes: `idx_log_task_date (task_id, maintenance_date DESC)`. Search uses plain
`LIKE` (§6.3); at the expected scale (well under ~200 tasks) no full-text index is
needed.

### 5.5 `runtime_cache`

Persists the last-seen runtime value per path so "current runtime" survives a
plugin restart and is available immediately.

| column    | type          | notes                         |
| --------- | ------------- | ----------------------------- |
| path      | TEXT PK       | SignalK path                  |
| value     | REAL NOT NULL | latest observed runtime hours |
| timestamp | TEXT NOT NULL | when observed                 |

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

| sub-status | condition                                                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `overdue`  | `remaining <= 0`                                                                                                                              |
| `due_soon` | not overdue AND within the lead window (runtime: `remaining_runtime <= runtimeNotifyLeadHours`; time: `remaining_time <= timeNotifyLeadDays`) |
| `ok`       | otherwise                                                                                                                                     |
| `unknown`  | dimension configured but inputs missing (e.g. runtime path set but no value seen yet)                                                         |

Overall precedence: `overdue` > `due_soon` > `ok` > `unknown`. A sort key
(`status_rank` + soonest `remaining`) is emitted so the UI's default sort =
"past-due first, then upcoming" is a straightforward server-side ORDER BY on the
already-computed list.

### 6.4 Slug generation

`slugify(name)` → lowercase, ASCII-fold, replace non-alphanumerics with `-`,
collapse repeats, trim. Ensure uniqueness by appending `-2`, `-3`, …

The slug is **auto-generated once, on first save** (create), from the name. After
that it is **user-editable**: the create form shows a live slug preview, and the
edit form exposes the slug as an editable field. Renaming the task does _not_
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

The SPA is served by SignalK at `/{pluginId}/` (i.e.
`/signalk-maintenance-tracker/`) because `package.json` includes the
`signalk-webapp` keyword and a `public/` directory. The files are served exactly
as authored (no build output).

- All asset references in `index.html` and ES-module imports use **relative paths**
  (`./app/main.js`, `../vendor/preact.js`) so they resolve correctly under the
  plugin mount without a configured base. No import maps (§3, §7.9).
- **Hash-based routing** (confirmed choice) so deep links and page refreshes work
  under the plugin mount without any server-side SPA fallback — everything after
  the `#` is client-side only and never hits the server (e.g.
  `/signalk-maintenance-tracker/#/tasks/oil-change`). SignalK serves the app at
  both `/signalk-maintenance-tracker/` and `/signalk-maintenance-tracker/index.html`,
  which is all a hash router requires. Implemented with `preact-router` in hash mode
  (or a small hand-rolled `hashchange` router). History/path-based routing would
  need the static handler to fall back to `index.html` for unknown deep paths; not
  relied on.
- API base URL: `/plugins/signalk-maintenance-tracker/api` (absolute path; the
  webapp and API share an origin). Because they are same-origin, the SignalK
  session cookie set at login is sent automatically with every API request
  (fetch `credentials: 'same-origin'`); no manual token handling is required for
  the common case (§7.7, §9).

### 7.2 App root & shell

`main.js` mounts the root `App` component (`app.js`) into `#app`. There is no
provider tree in the React-Context sense; cross-cutting state lives in **module-level
signals** imported where needed:

- **auth** — `useAuth()` over an auth signal (§7.7);
- **theme** — a color-scheme signal (§7.3);
- **toasts** — a small signal-backed notification queue rendered by a `<Toaster/>`
  in the shell (replaces Mantine's `Notifications`);
- **modals** — rendered declaratively from component state (no global modal
  provider); a shared `<Modal/>` primitive handles the overlay/focus-trap.

The shell header contains: app title, nav links (Tasks / Log), a global search box,
the theme toggle, and an **auth control** (`AuthControl`) — a "Log in" link when
anonymous, or the username + "Log out" when authenticated.

### 7.3 Theme (light/dark)

Implemented with CSS custom properties: a `data-theme="light|dark"` attribute on
`<html>` selects a set of color tokens defined in `public/styles/`. A theme signal
drives the attribute.

- Persisted explicit choice in `localStorage` is authoritative on load.
- With no stored choice, initialize from the `prefers-color-scheme` media query.
  This is a **progressive enhancement**: on Chromium 69 (which predates
  `prefers-color-scheme`, Chrome 76) the query simply doesn't match and the app
  falls back to the default (light) theme — the toggle still works everywhere. See
  §7.9.
- The header toggle flips the signal and updates `localStorage`; because color is
  driven by CSS variables + the `data-theme` attribute, the switch is instant with
  no component library involved.

### 7.4 Pages

**Task List (`/`)** — the main page.

- Hand-rolled `<Table/>` component, columns: status badge, name, tags, remaining
  runtime, remaining time, next due date, action icons. `view` is always shown; the
  write actions (`edit` / `delete` / `complete`) and the "New task" button are
  rendered only when logged in (§7.7). Logged-out visitors see the data and the
  `view` action.
- Default sort: overdue first, then due_soon, then upcoming — driven by the
  server's `status_rank` + remaining sort.
- Controls: freeform search box; tag filter (multi-select chips, select/deselect);
  column-header sorting (name, remaining runtime, remaining time); pagination.
- All list state (search, tags, sort, page) is held in the URL hash query string so
  views are shareable/bookmarkable and survive refresh (a `useListParams` helper
  over the hash router).
- Live-updating via the data layer's polling (default 5 s, configurable — §7.6).

**Task Detail (`/tasks/:slug`)**

- Shows name, rendered markdown description, tags, both intervals, current
  elapsed/remaining runtime and time (with CSS progress bars from
  `runtime_fraction` / `time_fraction`), next due date(s), and current status
  badge.
- A "Mark complete" button opening the Complete modal.
- A per-task log table with edit/delete actions on each entry.

**Master Log (`/log`)**

- One row per log entry across all tasks: task name (link), maintenance date,
  runtime hours, notes (truncated, expandable), logged_by.
- Sortable + searchable + paginated (server-side, same pattern as task list).

### 7.5 Modals

All modals are built on a shared hand-rolled `<Modal/>` primitive (overlay,
Escape-to-close, focus trap, `role="dialog"`) — no modal library.

- **Task form (create/edit)** — fields: name; slug (on create, shown as a live
  preview derived from name but editable; on edit, an editable field that warns
  the change breaks existing deep links, §6.4); markdown description (textarea
  with a preview toggle), tags (creatable
  multi-select fed by `GET /tags`), runtime interval (hours), time interval
  (number + unit select), runtime path (a tree / autocomplete picker built
  client-side from SignalK's `/signalk/v1/api/vessels/self` snapshot — fetched
  once and cached, §8.4 — the user selects a path string; free-text entry is also
  allowed), and — on create only — optional seed `last_maintenance` /
  `last_runtime`.
- **Complete** — maintenance datetime (default now), runtime hours (prefilled from
  the task's `current_runtime` from the `/tasks` API when a runtime path is set,
  §8.1/§8.4), notes (markdown). Submits a new log entry (§8,
  `POST /tasks/:slug/logs`).
- **Delete confirm** — simple confirmation; on confirm calls `DELETE
/tasks/:slug`.

### 7.6 Data layer

No react-query. A small hand-rolled, **signals-backed resource layer** provides the
same essentials (cache-by-key, polling, invalidation) in a fraction of the code and
with no post-Chromium-69 runtime-API dependencies (§7.9).

- A thin `fetch` wrapper (`api/client.js`) prefixes the API base and handles JSON +
  error normalization. It sends `credentials: 'same-origin'` so the SignalK session
  cookie rides along (§7.7). On any `401`/`403` it marks the session logged-out and
  prompts re-login (a toast + `openLoginModal()`, §7.2/§7.7) — covering both an
  expired session on a write and (given today's admin-only API) reads made while
  logged out.
- A `createResource(key, fetcher, { refetchInterval })` helper returns a signal of
  `{ data, error, loading }`, dedupes by `key`, and (when an interval is set) polls
  via a single shared `setInterval` while at least one component is subscribed. Hooks
  wrap it: `useTasks(params)`, `useTask(slug)`, `useLogs(params)`, `useTaskLogs(slug)`,
  `useTags()`.
- Mutations are plain async functions (`createTask`, `updateTask`, `deleteTask`,
  `addLog` (mark complete), `updateLog`, `deleteLog`) that, on success, **invalidate**
  the relevant resource keys (`tasks`, `task/:slug`, `logs`, `tags`) — triggering an
  immediate refetch so the UI reflects changes without waiting for the poll.
- `useSignalKPaths()` loads the `/signalk/v1/api/vessels/self` snapshot **once**
  (no `refetchInterval`, cached for the session), lazily on first task-editor open,
  and serves every autocomplete keystroke from the flattened in-memory list — never
  re-fetched per keystroke (§8.4).

### 7.7 Authentication (frontend)

The webapp logs the user in against the **SignalK server's own** auth endpoints
([SignalK security spec](https://signalk.org/specification/1.8.2/doc/security.html));
it does not manage credentials or authorization itself. The plugin webapp is
served same-origin with the server, so the session cookie SignalK sets at login is
sent automatically with every subsequent request (API calls and loginStatus/logout).

- **`useAuth()`** (`auth/`) exposes a module-level auth signal as
  `{ isLoggedIn, username, login(username, password), logout(), openLoginModal() }`.
  On app start it establishes the initial state by calling
  `GET /skServer/loginStatus`, which returns a JSON body such as
  `{ "status": "loggedIn", "username": "admin", "userLevel": "admin", ... }` when
  authenticated or `{ "status": "notLoggedIn", ... }` when not — the provider reads
  `status === "loggedIn"` for `isLoggedIn` and `username` for display. It also
  re-validates before the token's `timeToLive` elapses to keep the session fresh.
- **Login** — `POST /signalk/v1/auth/login` with `{ username, password }`. On
  success (200) SignalK sets the session cookie and returns `{ token, timeToLive }`;
  the provider records `timeToLive` for renewal and the entered `username` for
  display, and flips `isLoggedIn`. A 401 shows an inline "invalid credentials"
  error in the modal.
- **Logout** — `PUT /signalk/v1/auth/logout`; clears local state regardless of
  outcome.
- **`LoginModal`** — the shared `<Modal/>` primitive (§7.5) with username + password
  fields and inline error. Opened from the header `AuthControl`, and also auto-opened
  when an API call returns `401` (see §7.6).
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

> **Current-server caveat:** today SignalK requires _admin_ credentials for **all**
> plugin API routes, so in practice a user must log in (as admin) to load _any_
> data. The logged-out read-only experience becomes real once SignalK enforces
> per-route permission levels (§9); the gating above is already written for that
> future and needs no change when it lands.

### 7.8 Markdown rendering & safety

Task descriptions and log notes are markdown (§5). They are rendered with
**snarkdown** and the resulting HTML is **sanitized before insertion** (strip
`<script>`/`<style>`/event-handler attributes and `javascript:` URLs) so a note can
never inject script. A small `<MarkdownView/>` component owns render + sanitize +
`dangerouslySetInnerHTML` (Preact supports the same prop as React) in one place;
nothing else sets raw HTML.

### 7.9 Browser support & compatibility

**Floor: Chromium 69** (Navico/B&G MFDs, Sept 2018). **Ceiling: current evergreen
browsers.** The app is authored once to run on the floor and _progressively enhance_
upward — never the reverse.

**How compatibility is achieved.** End users run the webapp behind a reverse-proxy
plugin that transpiles the served JS/CSS on the fly, so **we do not bundle or
transpile**. But transpilation only rewrites _syntax_ — it does **not** polyfill
runtime APIs and does **not** fix CSS. So the real rules are about APIs and CSS, and
they hold regardless of the proxy:

- **Author to an ES2017 baseline.** Chromium 69 natively supports ES2017 and most of
  ES2018 (`async`/`await`, classes, spread, `Promise.finally`). Avoid newer _syntax_
  (`?.`, `??`, logical-assignment, private `#fields`); if any vendored dep uses it,
  the proxy down-levels it, but our own code stays proxy-independent.
- **No post-69 runtime APIs without a polyfill** (the proxy will not add these):
  `structuredClone`, `Array.prototype.at`, `Object.fromEntries`, `Promise.allSettled`,
  `String.prototype.matchAll`, `globalThis`, `queueMicrotask`. This constraint is a
  primary reason for the hand-rolled data layer (§7.6) over react-query and for
  hand-rolled tables over TanStack Table.
- **No import maps** (Chrome 89): imports use relative paths to vendored ESM (§3).
- **CSS baseline (Chromium 69).** Safe to use: custom properties, flexbox, CSS grid
  **incl. grid `gap`**, `position: sticky`, media queries, and woff2 webfonts
  (Bootstrap Icons — Chrome 36+). **Avoid** (or use only as
  non-essential enhancement): flexbox `gap` (Chrome 84 — use grid `gap` or margins
  for spacing that must exist on the floor), `:has()` (105), `:is()`/`:where()` (88),
  container queries (105), CSS nesting (112), `aspect-ratio` (88), `@layer` (99),
  `light-dark()`.

**Graceful degradation is explicitly fine.** Features that simply _don't apply_ on
old browsers — and leave the app fully usable — may be used freely as enhancement.
Canonical example: `prefers-color-scheme` for initial theme (Chrome 76; on 69 it
just doesn't match and we fall back to the default theme, toggle still works, §7.3).
The rule of thumb: an unsupported feature must degrade to _acceptable_, never to
_broken_.

**Verification.** Because there is no build to catch this, compatibility is a review
checklist item, and the polish phase (§14.10) includes a smoke test on a Chromium-69
engine (e.g. via a matching Puppeteer/BrowserStack target) covering load, list,
detail, and the complete-task flow.

---

## 8. REST API

Base path (mounted by `registerWithRouter`):
`/plugins/signalk-maintenance-tracker/api`

All responses are JSON. Errors use `{ "error": { "code": string, "message":
string } }` with appropriate HTTP status codes. List endpoints return
`{ "data": [...], "total": n, "page": p, "pageSize": s }`.

**Access control:** enforced by SignalK, not the plugin. Requests carry the
server's session (cookie or bearer token); SignalK decides who may reach these
routes and returns `401`/`403` itself. Today that means _admin_ is required for
all routes below; a future SignalK release will let the plugin declare a
per-route permission level (read for `GET`, write for mutations). The handlers
assume authorization has already passed and never re-check it (§9).

### 8.1 Tasks

| Method | Path           | Description                                                                                                                                                                                                                                                                                     |
| ------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/tasks`       | List tasks (paginated). Query: `search`, `tags` (csv), `status` (csv of overdue/due_soon/ok/unknown), `sort` (name\|remaining_runtime\|remaining_time\|status), `order` (asc\|desc), `page`, `pageSize`. Each item includes stored + computed fields (§6.2/6.3). Default sort = status urgency. |
| POST   | `/tasks`       | Create. Body below. Server generates slug.                                                                                                                                                                                                                                                      |
| GET    | `/tasks/:slug` | Task detail incl. computed fields, tags, and recent log entries (or a link + `GET /tasks/:slug/logs`).                                                                                                                                                                                          |
| PUT    | `/tasks/:slug` | Update editable fields (name, description, intervals, runtime_path, tags, consumables, seed last_* on tasks with no logs). May also change `slug` (normalized + uniqueness-checked; triggers notification-path migration, §6.4).                                                                |
| DELETE | `/tasks/:slug` | Delete task + its log entries (cascade). Clears its notification.                                                                                                                                                                                                                               |

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
  "last_runtime": 1240.5,
  "consumables": [
    { "item_id": "abc123", "item_name": "Oil filter", "qty_per_service": 1 }
  ]
}
```

`consumables` links this task to signalk-stowage-mgmt items it consumes on
completion (see `docs/inventory-interaction.md`) — omit the field to leave
existing links untouched, or send `[]` to clear them. `item_id`/`item_name`
are stowage-mgmt's own id and a cached display name (stowage-mgmt has no
shared database with this plugin); `qty_per_service` must be a positive
number.

Task response object (list item / detail):

```json
{
  "id": 1,
  "slug": "engine-oil-change",
  "name": "Engine oil change",
  "description": "…",
  "tags": ["Engines", "Port Engine"],
  "consumables": [
    { "item_id": "abc123", "item_name": "Oil filter", "qty_per_service": 1 }
  ],
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

| Method | Path                | Description                                                                                                                                                                                                                                                                                                                                                                                |
| ------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/logs`             | Master log, paginated. Query: `search`, `sort` (maintenance_date\|task\|runtime_hours), `order`, `page`, `pageSize`. Each item includes `task_slug` + `task_name`.                                                                                                                                                                                                                         |
| GET    | `/tasks/:slug/logs` | Log entries for one task.                                                                                                                                                                                                                                                                                                                                                                  |
| POST   | `/tasks/:slug/logs` | **Mark complete** — create a log entry. Recomputes task denormalized fields (§5.6) and refreshes the task's notification. `logged_by` is filled server-side from the request principal (§9), not the body. If the task has linked consumables (§8.1) and stowage-mgmt integration is configured, also decrements their stock — best-effort; see below and `docs/inventory-interaction.md`. |
| PUT    | `/logs/:id`         | Edit a log entry. Recomputes task fields if it was/becomes the latest.                                                                                                                                                                                                                                                                                                                     |
| DELETE | `/logs/:id`         | Delete a log entry. Recomputes task fields.                                                                                                                                                                                                                                                                                                                                                |

Log create body (mark complete):

```json
{
  "maintenance_date": "2026-07-08T14:30:00Z",
  "runtime_hours": 1360.0,
  "notes": "Replaced filter, topped up coolant.",
  "consume_stock": true
}
```

`consume_stock` defaults to `true` when the task has linked consumables; set
`false` to log the work without touching stowage-mgmt stock. The log entry
is created regardless of whether stock consumption succeeds — it is never
rolled back for a stowage-mgmt failure. If any linked item's stock update
fails for a reason worth surfacing (as opposed to stowage-mgmt simply being
unreachable/not installed, which is treated as normal), the response
includes a `consumable_warnings: string[]` field alongside the usual log
fields.

### 8.3 Tags

| Method | Path    | Description                                                  |
| ------ | ------- | ------------------------------------------------------------ |
| GET    | `/tags` | All tags with usage counts, for filter chips + autocomplete. |

Tags are created/removed implicitly through task create/update. (A `DELETE
/tags/:id` may be added later for manual cleanup; v1 auto-prunes orphans.)

### 8.4 SignalK path discovery (no plugin endpoint)

The plugin exposes **no** `/signalk/*` helper routes. The task editor's
runtime-path picker is built entirely on the client from SignalK's own read-only
REST snapshot — `GET /signalk/v1/api/vessels/self` — which the frontend fetches
directly (same origin, alongside the auth endpoints, §7.7) and walks to produce a
tree of candidate runtime paths. This snapshot is used **only to discover path
names** for the picker; it is never the source of truth for maintenance runtime.

The snapshot document can be large, so the frontend fetches it **once per app
session** — lazily, the first time the task editor is opened (so read-only
sessions never pay the cost) — flattens it into a cached in-memory list of
candidate path strings, and serves every keystroke of the autocomplete from that
cached list. It is **never** re-fetched while the user types. In practice this is
the `useSignalKPaths()` resource (§7.6) with no `refetchInterval` and no
per-keystroke request. Paths are effectively static, so refreshing the candidate
list just means reloading the app; the picker does not live-sync when a new path
appears at runtime.

All runtime _values_ the UI shows or prefills — current runtime, elapsed /
remaining, and the Complete modal's runtime prefill — come from the plugin's
`/tasks` API as the already-hours-converted `current_runtime` (§8.1, §10.2). The
backend stays the single owner of runtime data and the sole seconds→hours
conversion boundary; the frontend never reads runtime _values_ from SignalK.

### 8.5 Status/health

| Method | Path      | Description                                                                                       |
| ------ | --------- | ------------------------------------------------------------------------------------------------- |
| GET    | `/health` | Plugin status: db task/log counts, subscribed runtime paths, last recompute tick, plugin version. |

### 8.6 Auth

The plugin exposes **no** auth endpoints. The webapp authenticates directly
against the SignalK server's native endpoints (same origin):

| Method | Path                      | Purpose                                                                                                                                            |
| ------ | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/signalk/v1/auth/login`  | Log in with `{ username, password }`; returns `{ token, timeToLive }` and sets the session cookie.                                                 |
| GET    | `/skServer/loginStatus`   | Check the session; returns JSON `{ "status": "loggedIn" \| "notLoggedIn", "username", "userLevel", ... }`; used for initial state + token refresh. |
| PUT    | `/signalk/v1/auth/logout` | Log out; clears the session.                                                                                                                       |

See §7.7 for the frontend flow and §9 for how these gate the plugin's own routes.

---

## 9. Authentication & access control (backend)

**The plugin builds no authorization of its own.** Access control is entirely the
SignalK server's responsibility:

- **Today:** SignalK requires _admin_ credentials for every route registered via
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

The one thing the backend still _reads_ from the session is the caller's identity,
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
  updates: [
    {
      values: [
        {
          path: `notifications.maintenance.${slug}`,
          value: {
            state, // configured alarm state for the task's status
            method: ['visual'],
            message: 'Engine oil change is overdue by 20 runtime hours',
            timestamp: nowIso,
          },
        },
      ],
    },
  ],
});
```

The alarm state for each task status is configurable (`alarmState*` options),
choosing from SignalK's states `none | normal | alert | warn | alarm | emergency`.
Defaults: `overdue → alarm`, `due_soon → warn`, `ok → none`. A `none` state
publishes a `null` value, which clears the notification. `unknown` publishes
nothing (or clears a prior notification). Notifications are only published when
`enableNotifications` is true and when a task's state changes (to avoid delta
spam); a task with both dimensions publishes one notification reflecting the more
urgent dimension, with the message naming which dimension triggered it.

> Note on path: SignalK's notification tree is `notifications.*` (plural). The
> initial spec wrote `notification.maintenance.{slug}.*`; this spec uses the
> SignalK-correct `notifications.maintenance.{slug}`. Splitting into
> `…/{slug}/runtime` and `…/{slug}/time` sub-paths is a possible future refinement.

### 10.4 Plugin config schema

Exposed in the SignalK admin UI (`plugin.schema`):

| option                   | type    | default | purpose                                   |
| ------------------------ | ------- | ------- | ----------------------------------------- |
| `enableNotifications`    | boolean | true    | master switch for notification publishing |
| `alarmStateOk`           | string  | `none`  | alarm state for up-to-date tasks          |
| `alarmStateDueSoon`      | string  | `warn`  | alarm state for due-soon tasks            |
| `alarmStateOverdue`      | string  | `alarm` | alarm state for overdue tasks             |
| `runtimeNotifyLeadHours` | number  | 10      | runtime lead window for `due_soon`/warn   |
| `timeNotifyLeadDays`     | number  | 7       | time lead window for `due_soon`/warn      |
| `recomputeIntervalMs`    | number  | 60000   | backend status-recompute tick             |

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
- **Deep-link routing:** **hash-based routing** (confirmed). The app is served at
  both `/signalk-maintenance-tracker/` and `…/index.html`; a hash router needs no
  server-side SPA fallback. (§7.1)
- **Access control:** owned entirely by SignalK — the plugin builds no authz.
  Today all plugin routes are admin-only; a future SignalK release adds per-route
  permission levels. The webapp does login/logout/loginStatus against SignalK's
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
    "build": "tsc",
    "watch:backend": "tsc -w",
    "typecheck:frontend": "npm --prefix frontend run typecheck",
    "test": "vitest run && npm --prefix frontend run test",
    "clean": "rimraf dist",
  },
  "files": ["dist/", "public/"],
  "engines": { "node": ">=22.5" },
  "dependencies": {},
  "devDependencies": { "typescript": "…", "@types/node": "…" },
}
```

- **Backend only has a build** (`tsc` → `dist/`). The frontend has **no build**:
  `public/` is hand-written source (ES modules + vendored ESM deps + CSS) that ships
  and runs unchanged, so it is not gitignored, has no `outDir`, and `clean` never
  touches it. `frontend/` supplies only dev-time type-checking + tests.
- No runtime DB dependency: `node:sqlite` is part of Node itself (no
  `better-sqlite3`, no native build step). `engines.node` enforces the ≥22.5 floor
  the module requires; `@types/node` supplies its type definitions.
- Published package ships compiled `dist/` (backend) and the `public/` webapp
  source; `dist/` is gitignored but included via `files`.

### 12.2 Dev workflow

- Backend: `npm run watch:backend`, then restart the plugin from the SignalK admin
  UI (or run SignalK from a checkout with the plugin linked via `npm link`).
- Frontend: because it is buildless, the simplest loop is to develop the plugin
  linked into a running SignalK server and let SignalK serve `public/` directly —
  edit a `.js`/`.css` file and reload the browser (no HMR, no bundler). For iterating
  away from a server, any static file server pointed at `public/` works, fronted by a
  small dev proxy that forwards `/plugins/signalk-maintenance-tracker/api` and
  `/signalk` to the live SignalK server. `npm --prefix frontend run typecheck`
  (tsc `--noEmit`, `checkJs`) type-checks the JSDoc-annotated modules.

### 12.3 Install (end user)

Via the SignalK Appstore (once published) or `npm install` into the server's
plugin directory. The webapp then appears in the SignalK Webapps menu.

---

## 13. Development methodology: test-driven development

The app is developed **test-driven**: comprehensive tests are written in
parallel with functionality, not deferred to a later phase. For each unit of
work, tests are written first (or alongside), the implementation makes them
pass, and a phase of the plan in §14 is only "done" when its tests pass.

Coverage expectations by layer:

- **Backend unit tests** — domain logic (§6: status/remaining calculations,
  slug generation), the denormalization invariant (§5.6), and repositories
  (against a temp SQLite file or in-memory DB — `node:sqlite` needs no mocking).
- **Backend API tests** — the REST endpoints of §8 exercised through the Express
  router (CRUD, list filtering/sorting/pagination, error shapes, recompute side
  effects), with the SignalK `app` interface stubbed.
- **SignalK integration tests** — runtime subscription/caching and the
  seconds→hours boundary (§10.2), notification publishing and state-change
  de-duplication (§10.3), against a stubbed `app.handleMessage`/streambundle.
- **Frontend tests** — component/hook tests for the data layer, auth gating
  (§7.7), and the key page flows (task list filtering, complete modal), with the
  REST API mocked.

Suggested tooling: **vitest** for both backend and frontend, with
**@testing-library/preact** (jsdom) on the frontend; final framework choice is an
implementation detail. Test files live co-located with the code they test
(`*.test.ts` for the backend, `*.test.js` for the frontend), and `npm test` runs
the backend and frontend suites.

---

## 14. Phased implementation plan

Per §13, every phase below includes writing its tests in parallel with the
functionality; a phase is complete only when its tests pass.

1. **Scaffold** — repo layout, `package.json`, `tsconfig`, plugin entry that
   loads and appears in the admin UI; empty Express router mounted.
2. **DB + domain** — schema, migrations, repositories, slug + status calculators
   with unit tests.
3. **Task/log/tag REST API** — full CRUD + list filtering/sorting/pagination
   (no SignalK integration yet; runtime/current values null).
4. **SignalK read** — runtime subscription + cache; `current_runtime` and runtime
   computed fields populated on the `/tasks` API. No plugin `/signalk/*` routes —
   the editor's runtime-path picker reads SignalK's own snapshot client-side (§8.4).
5. **Notifications** — recompute tick + publishing with lead-window config.
6. **Frontend scaffold** — buildless Preact app in `public/`: `index.html`, vendored
   ESM deps, hash router, signals data layer (§7.6), theme (§7.3), shared `<Modal/>`
   and `<Table/>` primitives, CSS baseline (§7.9).
7. **Task list page** — table, search, tag filter, sort, pagination, polling.
8. **Task detail + modals** — detail page, create/edit/complete/delete modals.
9. **Master log page.**
10. **Polish** — empty/loading/error states, responsive layout, accessibility,
    **Chromium-69 smoke test (§7.9)**, docs/README, appstore metadata.
