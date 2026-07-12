# signalk-stowage-mgmt interaction

Status: **implemented** on branch `inventory-interaction` (not yet released
— see CHANGELOG once merged/tagged). Started as a brainstorm; this doc now
also records what was actually built and where it ended up differing from
the original sketch. Goal is to connect maintenance tasks (this plugin) with
the physical inventory of parts/consumables (`signalk-stowage-mgmt`), so
each system does what it's good at instead of duplicating data.

## Why

Right now the two plugins don't know about each other:

- **maintenance-tracker** tracks _when_ something is due (oil change, filter
  swap, impeller, zincs...) but has no idea whether you actually have the
  part on board.
- **stowage-mgmt** tracks _what_ you have and _where_ it is, but has no
  concept of "this item is consumed by task X" or "you're about to need 3 of
  these."

Bridging them turns "task is due soon" into "task is due soon **and you're
out of oil filters**" — which is the actually-useful version of a maintenance
reminder on a boat.

## Constraints from both plugins' current designs

- Both are buildless Preact/vanilla SPAs served as SignalK webapps, both use
  `node:sqlite`, both auth via SignalK's own `/signalk/v1/auth/*` — no
  bespoke auth to design.
- stowage-mgmt items can be **split across locations**; the item's overall
  quantity is the sum of placements. Any "do we have enough stock" check
  needs to use the item's total quantity, not a single placement.
- stowage-mgmt has `target_quantity` (used for the existing Understocked
  view) and an item log (`GET /item-log`) recording quantity changes.
- stowage-mgmt item ids are `TEXT` (not autoincrement integers) — this only
  surfaced once the DB migration was written; see "Corrections" below.
- stowage-mgmt's `GET /items` originally had no search/filter query params
  or single-item lookup; both were added in stowage-mgmt v0.8.2
  ([BoatHacks/signalk-stowage-mgmt#16](https://github.com/BoatHacks/signalk-stowage-mgmt/issues/16)).
  The backend now uses `GET /items/:id` (see §3); the frontend picker still
  fetches the full list — see "Corrections" below for why.
- maintenance-tracker tasks have `runtime_interval` / `time_interval` +
  `last_maintenance` / `last_runtime`, and on completion a `POST
/tasks/:slug/logs` call marks the task done — a completion is a very
  natural moment to also decrement stock.
- Both plugins are separate SignalK plugins/webapps with their own SQLite
  DBs — no shared database, so the integration has to be at the **API
  level**, not a shared schema.

## Integration shape: loose coupling via REST, not a shared DB

Two SignalK plugins on the same server can already reach each other's REST
APIs (both mounted under `/plugins/<id>/api`, both behind the server's own
auth). That argues for maintenance-tracker being the one that _calls_
stowage-mgmt's API when needed, rather than merging data models. Neither
plugin becomes a hard dependency of the other — if stowage-mgmt isn't
installed, maintenance-tracker just skips the inventory features.

The implementation ended up split further than the original sketch assumed,
once it became clear stowage-mgmt's API sits behind the same session-cookie
auth as ours, with no service-to-service credential of its own:

- **Reads** (parts picker autocomplete, stock badges) are same-origin
  fetches made **directly from the browser** to stowage-mgmt's API
  (`public/app/api/stowage.js`). The browser already carries the session
  cookie stowage-mgmt needs — no backend involvement, no proxy endpoint.
- **The one write** (decrementing stock on task completion) goes through
  our backend (`src/stowage/client.ts`, `StowageClient`), because it's a
  side effect of a request that already lands on our server
  (`POST /tasks/:slug/logs`). That handler forwards the _caller's own_ auth
  headers (cookie/authorization) to the outgoing stowage-mgmt call, rather
  than the plugin holding any credentials of its own.

This is simpler than routing everything through a unified backend client:
reads need no new endpoints or auth-forwarding of their own, and the only
place auth-forwarding logic exists is the one write path that actually
needs it.

### 1. Link a task to one or more stowage items ("consumables") — done

`task_consumables` table (`src/db/migrations.ts`, schema v2):

```sql
CREATE TABLE task_consumables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,        -- stowage-mgmt's own item id (TEXT, see above)
  item_name TEXT NOT NULL,      -- cached at link time, see "stale links" below
  qty_per_service REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE (task_id, item_id)
);
```

`ConsumablesRepo` (`src/db/consumables.repo.ts`) provides `forTask`/`byTask`
(batched, for list views)/`setForTask` (wholesale replace)/`updateCachedName`
/`removeForTask`.

Rather than new REST endpoints, consumables travel through the **existing**
task create/update/list/detail JSON — the same treatment as `tags`:
`POST`/`PUT /tasks` accept an optional `consumables: [{item_id, item_name,
qty_per_service}]` array (omit = leave untouched, `[]` = clear); every
`TaskDTO` includes the current list. Backend validation
(`validateConsumables` in `src/service.ts`) rejects a blank id/name or a
non-positive `qty_per_service` with `400 invalid_consumable`.

The task editor's "Parts used" section (`ConsumablesPicker.js`) is a
search-and-add combo against stowage-mgmt's `GET /items` (client-side
filtered, since there's no search param) plus a qty-per-service input per
linked row — mirrors `TagInput`'s chip shape. If stowage-mgmt is
unreachable, existing links stay viewable/editable/removable; only _adding_
new ones is blocked, with an inline notice (not a toast — see "Discovery /
failure handling" below).

### 2. Show stock status alongside due status — done (badge only)

`StockBadge.js` renders **In stock** / **Low stock** / **Out of stock** next
to a task's status badge (list and detail pages) — worst case across all of
a task's linked items (`summarizeStock()` in `public/app/api/stowage.js`):
any item at 0 → out; any item below `target_quantity` → low; otherwise ok.
Renders nothing for a task with no linked consumables.

**Not done: notification escalation.** The original sketch floated
escalating a "due soon" notification when the required part is also out of
stock. Left out of this pass — it would need the backend's notification
recompute loop to also poll stowage-mgmt, which is a bigger, more speculative
piece than the UI badge. Worth revisiting if the badge alone proves useful in
practice.

### 3. Decrement stock on task completion — done

`StowageClient.consumeForTask()` (`src/stowage/client.ts`): looks up the
item via `GET /items/:id` (stowage-mgmt v0.8.2+;
see "Corrections" below), floors the result at
0, and `PATCH`es `actual_quantity` with a note — `Used for maintenance task:
{name} ({date})`. Used for items that aren't split across locations.

For a **split item**, the person completing the task picks which
location(s) it came from — stowage-mgmt's maintainer deliberately rejected
an endpoint that would auto-pick a placement
([BoatHacks/signalk-stowage-mgmt#17](https://github.com/BoatHacks/signalk-stowage-mgmt/issues/17)),
so the "mark complete" dialog (`LogEntryModal.js` +
`PlacementAllocator.js`) surfaces a location field per split consumable:
one field appears, the person picks a location, the needed quantity is
drawn from it (capped to what's there); if that doesn't cover the full
amount, another field appears automatically for the remainder, and so on.
The frontend sends the resulting `{item_id, placements: [{placement_id,
quantity}]}[]` as `consumable_allocations` alongside the completion;
`StowageClient.consumeFromPlacements()` validates the whole allocation
against a fresh read of the item's current placements before changing
anything (all-or-nothing), then applies each placement update via
stowage-mgmt's `PATCH /items/:id/placements/:placementId` (released well
before v0.8.2, so no version gating was needed for it), which keeps the
item's overall `actual_quantity` in sync and logs each change like an
ordinary
quantity edit.

Wired into `POST /tasks/:slug/logs` (`MaintenanceService.addLog` →
`consumeStock`, `src/service.ts`): runs **after** the log entry's own
transaction commits, never inside it — a stowage-mgmt failure must never
roll back a completed task. `consume_stock` in the request body defaults to
true when the task has linked consumables; `false` skips it (and the
allocation requirement) for that completion only. An item with no matching
`consumable_allocations` entry is treated as non-split; if it turns out to
actually be split, `consumeForTask` refuses it and that surfaces as an
ordinary warning rather than the service guessing a location. Any failure
worth surfacing comes back as `consumable_warnings: string[]` alongside the
log entry; the frontend toasts these without blocking the completion
itself.

Requires the `stowageMgmtUrl` plugin option to be set (blank = disabled,
explicit opt-in — no autodetection, `src/config.ts`).

### 4. (Later / optional) Reverse direction: "needed for upcoming task" — not done

stowage-mgmt already has an Understocked view. A stretch goal: expose a
small read-only endpoint from maintenance-tracker
(`GET /api/consumables-summary` or similar) that stowage-mgmt _could_
optionally query to annotate items with "needed for: Oil change (due in 12
days)" — still speculative, only worth doing if the rest proves useful in
practice. Not started.

## Resolved decisions

- **Stale/deleted linked items:** cross-plugin item reference is inherently
  soft (no FK across two SQLite files). The item's `name` is cached at link
  time (`task_consumables.item_name`) alongside the id — implemented via
  `ConsumablesRepo.updateCachedName`, refreshed whenever a task is re-saved
  with the same item still linked. `summarizeStock()` simply ignores a link
  whose item id stowage-mgmt no longer returns, rather than erroring.

- **Discovery / failure handling:** no startup health-check probe — each
  call is try/catch'd inline (both the backend `StowageClient` and the
  frontend `stowage.js`). Two distinct failure modes, handled differently,
  both implemented as a dedicated `StowageUnavailableError` type (one in
  each of `src/stowage/client.ts` and `public/app/api/stowage.js`) that
  callers check for:
  - **Normal case (no consumables linked, or plugin genuinely not
    installed — a 404 on the `/items` route, or a network-level fetch
    failure):** the consumables UI section simply doesn't render (or, in the
    picker, shows an inline "could not reach stowage-mgmt" notice — see
    below). No toast, no noise.
  - **Signal of a real problem** — i.e. the task _has_ linked consumables
    (or other local evidence of prior successful interaction with
    stowage-mgmt), but a call now fails for a reason other than
    `StowageUnavailableError` (5xx, or the item lookup itself erroring):
    `StockBadge.js` toasts once per distinct error (bottom-right, via the
    existing `Toaster`) rather than silently hiding it — "something that
    used to work stopped working," distinct from "nothing to show."
  - The **picker** is a partial exception: even with zero linked
    consumables yet, a person actively editing a task and trying to add a
    part deserves to know why the search box isn't working. That case uses
    an inline notice inside `ConsumablesPicker.js`, not a toast — a toast
    is for "something you already had is now broken," not "the thing you're
    about to try isn't available."
  - Rationale unchanged from the original decision: collapsing all of this
    into silent non-rendering would hide problems like a typo'd item id or
    stowage-mgmt being down behind the same UI as "not installed."

- **Picker location:** task editor, as a "Parts used" field below Tags —
  same treatment as `tags` (optional, low-friction to skip, no separate
  settings screen). Implemented as-is.

- **Multiple items per task:** join table (`task_consumables`) from the
  start, not a single `item_id` column — e.g. oil change = filter + N
  liters of oil. Implemented as-is.

## Corrections found during implementation

- **Split items are handled after all — just not automatically.** The first
  pass of this integration refused to touch split items entirely (see the
  original §3 text, still visible in git history), on the theory that
  picking a placement automatically wasn't this plugin's call to make.
  Filed as [BoatHacks/signalk-stowage-mgmt#17](https://github.com/BoatHacks/signalk-stowage-mgmt/issues/17)
  asking stowage-mgmt for an auto-pick endpoint; the answer was "no, on
  purpose" — a person should say which location something came from. That
  reframed the problem: instead of stowage-mgmt picking a placement, _our_
  UI needed to let the person pick one (or several) interactively during
  task completion. `PlacementAllocator.js` + `consumeFromPlacements()` are
  the result — not in the original sketch at all.
- **`item_id` is `TEXT`, not `INTEGER`.** The original sketch's schema
  sample used an integer id; stowage-mgmt actually primary-keys `items` as
  `TEXT` (`plugin/db.js`). Caught before the migration shipped anywhere
  (amended in place rather than adding a follow-up migration) — see
  `src/db/migrations.ts` schema v2 and `src/db/consumables.repo.ts`.
- **`GET /items/:id` shipped in stowage-mgmt v0.8.2** — closing
  [BoatHacks/signalk-stowage-mgmt#16](https://github.com/BoatHacks/signalk-stowage-mgmt/issues/16),
  filed from the original gap noted above. `StowageClient.getItem()`
  (backend) now calls it directly instead of fetching the entire item list
  to find one — the exact case #16 was filed for. Its `?q=` search param
  went unused: the frontend picker/badges already share one cached
  unfiltered item list (polled) for both purposes, and switching the picker
  to per-keystroke server-side search would trade one cheap poll for many
  small ones — not a win at a boat's inventory scale. One wrinkle:
  `GET /items/:id`'s 404 is ambiguous by status code alone between "no such
  item" (stowage-mgmt itself answered) and "route doesn't exist" (the
  plugin likely isn't mounted, so SignalK's generic 404 handler answered
  instead) — `getItem()` disambiguates by checking whether the body is
  stowage-mgmt's own documented `{error: {...}}` JSON shape.
  `GET /items`'s existing 404 handling (the unfiltered list route, always
  present if the plugin is mounted) is unambiguous and unchanged.
- Also worth knowing: `v0.8.2`'s automated npm publish (like `v0.8.1`
  before it) failed in CI and needed a manual publish — consistent with
  the known Trusted Publisher 2FA setup gap noted elsewhere. Not something
  this integration needed to work around, just a reminder that "tagged on
  GitHub" and "installable via npm" aren't the same thing for this
  particular repo yet.
- **Read/write split wasn't in the original sketch.** The sketch described
  "maintenance-tracker calls stowage-mgmt's API" as one thing; in practice
  it's two different call sites with different auth stories (see
  "Integration shape" above) — decided partway through implementation once
  the auth question was worked through concretely.

## Non-goals (for now)

- No shared database / schema migration between the two plugins.
- No attempt to have stowage-mgmt understand maintenance _schedules_ —
  keeping the dependency direction one-way (maintenance-tracker depends on
  stowage-mgmt's API, not vice versa) keeps this simple to reason about and
  easy to back out of if it doesn't prove useful.
- Notification escalation on low/out-of-stock (see §2) and the reverse-
  direction stretch goal (§4) — both still open, not started.
