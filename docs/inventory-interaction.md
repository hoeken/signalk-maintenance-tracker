# Sketch: interaction with signalk-stowage-mgmt

Status: **draft / brainstorm**, not implemented. Goal is to connect
maintenance tasks (this plugin) with the physical inventory of parts/consumables
(`signalk-stowage-mgmt`), so each system does what it's good at instead of
duplicating data.

## Why

Right now the two plugins don't know about each other:

- **maintenance-tracker** tracks *when* something is due (oil change, filter
  swap, impeller, zincs...) but has no idea whether you actually have the
  part on board.
- **stowage-mgmt** tracks *what* you have and *where* it is, but has no
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
auth). That argues for maintenance-tracker being the one that *calls*
stowage-mgmt's API when needed, rather than merging data models. Neither
plugin becomes a hard dependency of the other — if stowage-mgmt isn't
installed, maintenance-tracker just skips the inventory features.

### 1. Link a task to one or more stowage items ("consumables")

Add an optional join, e.g. a new `task_consumables` table:

```
task_id      INTEGER  -- FK to tasks
item_id      INTEGER  -- stowage-mgmt item id (opaque foreign key, no FK constraint across DBs)
qty_per_service  REAL -- how many/much this task uses when completed
```

Surfaced in the task editor as "Parts used" — a searchable picker that
queries stowage-mgmt's `GET /items` for autocomplete, storing just the
item id + a cached name/label (so the UI still shows something sensible if
stowage-mgmt is later uninstalled or the item deleted).

### 2. Show stock status alongside due status

When rendering the task list/detail, for any task with linked consumables,
fetch current `actual_quantity` for those item ids from stowage-mgmt and
show a simple badge: **In stock**, **Low** (below `target_quantity`), or
**Out of stock**. This turns the existing due/overdue badge into a two-axis
signal at a glance — e.g. "Oil change: due soon · out of stock."

Could also feed into `notifications.maintenance.{slug}` — e.g. escalate a
"due soon" to a stronger notification method if the required part is out of
stock, since that's the case where the boat owner actually needs to act
*now* (order the part) rather than just noting it.

### 3. Decrement stock on task completion

When a task with linked consumables is marked complete (`POST
/tasks/:slug/logs`), offer to also log the consumption in stowage-mgmt —
e.g. `PATCH /items/:id` reducing `actual_quantity` by `qty_per_service`,
with a note like "Used for maintenance task: Oil change (2026-07-11)" so it
shows up in stowage-mgmt's own item log for traceability. This should be
**opt-in per completion** (a checkbox in the "mark complete" dialog,
pre-checked), not silent/automatic — consistent with your general
preference for explicit actions over automation surprises.

### 4. (Later / optional) Reverse direction: "needed for upcoming task"

stowage-mgmt already has an Understocked view. A stretch goal: expose a
small read-only endpoint from maintenance-tracker
(`GET /api/consumables-summary` or similar) that stowage-mgmt *could*
optionally query to annotate items with "needed for: Oil change (due in 12
days)" — but this is speculative and only worth doing if the first three
pieces prove useful in practice.

## Open questions

- Cross-plugin item reference is inherently soft (no FK across two SQLite
  files) — need to decide how to handle a linked item being deleted in
  stowage-mgmt (best effort: catch 404 on lookup, show "linked item no
  longer exists" instead of erroring the whole task view).
- Discovery: does maintenance-tracker probe for stowage-mgmt at startup
  (`GET /plugins/signalk-stowage-mgmt/api/health` equivalent, if one
  exists) and disable consumables UI if absent, or just fail gracefully
  per-call? Leaning towards the latter — simpler, no cross-plugin startup
  ordering dependency.
- Where does the "parts used" picker live in the UI — task editor, or a
  separate lightweight settings screen? Probably task editor, as a new
  optional section, to keep it discoverable without cluttering the common
  case (a task with no consumables).
- Multiple items per task (e.g. oil change = filter + N liters of oil) needs
  the join table from the start, not a single `item_id` column — sketch
  above already assumes this.

## Non-goals (for now)

- No shared database / schema migration between the two plugins.
- No attempt to have stowage-mgmt understand maintenance *schedules* —
  keeping the dependency direction one-way (maintenance-tracker depends on
  stowage-mgmt's API, not vice versa) keeps this simple to reason about and
  easy to back out of if it doesn't prove useful.
