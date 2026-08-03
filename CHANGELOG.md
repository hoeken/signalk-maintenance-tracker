# v1.5.0

The tracker learns the difference between maintenance you repeat and jobs you
do once: one-off **todo** items now live alongside recurring tasks.

## Highlights

- **One-off todos.** Every task now carries an `is_recurring` flag. Recurring
  tasks work as before (and must have at least one interval — runtime or
  time); a todo has no schedule at all, just an optional due date. An open
  todo wears a blue **Todo** badge, sorts above `ok` (it's actionable), and
  raises no notification until its due date makes it due-soon or overdue.
  Completing a todo archives it — unarchive to reopen it. A **New Todo**
  button sits next to **New Task**, opening the same form with the new
  "Recurring task" toggle off; toggling an existing task to todo clears its
  schedule fields.
- **`info` is now `pending`.** The old catch-all `info` status split in two:
  schedule-less tasks became todos, and `pending` now means exactly one
  thing — a recurring task that can't compute its status yet (an interval
  with no completion ever logged, or a runtime path with no reading seen).
  Sort order is `overdue → due_soon → todo → ok → pending → archived`.

## Smaller changes and fixes

- Modals grow to 800px wide on displays 900px and up, so long forms like the
  task editor stop feeling cramped; narrow displays keep the 400px layout.
- Form errors now scroll into view when they appear. On a long form the error
  banner could sit above the fold, making a failed save look like a dead
  button. All five modals share the new error component, which also announces
  itself to screen readers.
- Paired form fields (interval, warning window, seed values) stack into a
  single column on displays 640px and narrower instead of squeezing
  side by side.

## Migration notes

- Migration 7 backfills the flag: tasks with a runtime or time interval stay
  recurring, everything else becomes a todo (with any runtime path/warning
  cleared). If one of those was really a recurring "tracker" task, give it an
  interval — or just unarchive it whenever the work comes around again.
- **API:** the `info` status value is gone; `todo` and `pending` are new
  (`?status=info` bookmarks and filters need updating). `is_recurring` is a
  boolean on task bodies; omitted on create, it is inferred from whether an
  interval is present, so pre-v1.5 API calls keep working. Todos reject
  intervals/runtime paths, recurring tasks reject having neither interval
  (`400 invalid_recurring`).

# v1.4.0

Retired gear can now retire its tasks too, and the task list is quicker to
narrow down to the work you actually mean.

## Highlights

- **Archive a task.** A decommissioned watermaker's service history is worth
  keeping, but its overdue badge isn't. The task detail page gains an
  **Archive**/**Unarchive** button: an archived task keeps its log and its
  computed figures, but reads as the new `archived` status, ranked after
  `info` — it sinks to the end of the default sort, drops out of the other
  status filters into its own chip, and never raises a notification
  (archiving also clears one the task had already raised). On the API,
  `is_archived` is a plain boolean on the task, and `archived` joins the
  status values that responses and published SignalK paths can carry.
- **Filter the task list by status.** The tag chips get a sibling row of
  status chips (Overdue, Due Soon, OK, Info, Archived), and search, tag and
  status narrow the list together. Both chip rows are now single-select —
  a task has exactly one status, and tags are used as categories, so
  combining two of either usually narrowed to nothing; clicking a chip
  replaces the selection and clicking it again clears it. The API still
  accepts CSV for both, so hand-written multi-value URLs keep working, and
  the selection lives in the URL hash like the rest of the list state.
- **Search matches status too.** Typing `due` — or `due soon`, spaces work —
  now finds the tasks wearing that badge, alongside the usual name,
  description, tag and note matches, so a status can be typed as well as
  clicked.
- **Consumables link to their stowage item.** Each consumable name on the
  task detail page is now a link to the item's own page in stowage-mgmt, so
  "how many are left, and where?" no longer means opening Stowage Management
  and searching for the item by hand.

## Smaller changes and fixes

- Task status labels are capitalized wherever they're shown ("Due Soon",
  "OK"), matching the stock badges.
- The tag chips no longer show per-tag counts; live counts meant a redraw of
  the whole chip row on every keystroke, a flicker that cost more than the
  number was worth. (`GET /tags` still returns each tag's count.)
- Info badges are now accent-blue; grey now means archived.

# v1.3.0

Notes and descriptions now render the way you typed them: pasted URLs become
links, and line breaks stay where you put them. And the `unknown` task status
is now `info`.

## Highlights

- **Bare URLs in notes and descriptions become links.** Pasting a manual's URL
  into a note used to leave dead text, since markdown only links explicit
  `[text](url)`. Bare `http(s)://` and `www.` runs are now anchored, with the
  hostname as the link text (a pasted tracking URL is unreadable inline) and the
  full URL on hover. Linking runs over the already-sanitized HTML and skips text
  inside existing links, `code` and `pre`, so it can't reintroduce a
  `javascript:` URL.
- **Line breaks survive.** A note typed over several lines came out as one
  run-on line, because a lone newline means whitespace to markdown but a line
  break to whoever typed it into a textarea. Single newlines are now kept as
  breaks and runs of blank lines are no longer collapsed, while fenced code
  blocks and list spacing are left exactly as markdown intends them.
- **The `unknown` task status is now `info`.** A task with no intervals is a
  plain informational record, not one whose state we failed to work out — but
  the badge read "unknown", which sounds like something is missing. The rename
  goes all the way through: badge, CSS tokens, API filter value, and the status
  the notification manager declines to publish for. Precedence is unchanged:
  `overdue` > `due_soon` > `ok` > `info`.

## Breaking changes

- `GET /tasks?status=unknown` no longer matches anything. Unrecognized filter
  values are dropped rather than rejected, so an old caller gets an unfiltered
  list instead of an error — pass `status=info` instead. Task status values in
  API responses and on published SignalK paths change from `unknown` to `info`
  as well.

## Smaller changes and fixes

- The task detail page no longer shows a "Description" heading (or a "No
  description." placeholder) for a task that only has consumables.

# v1.2.0

A task detail page that puts the numbers you actually compare side by side,
plus figures for tasks that have no schedule at all.

## Highlights

- **Schedule and Runtime are now their own tabular cards.** The old prose
  readout ("Current 1360 h · last done at 1240.5 h · due at 1440.5 h") buried
  the numbers. Each dimension gets its own card with an Interval / Today /
  Last / Elapsed / Next / Remaining table — current reading above the
  last-service one, elapsed as their difference right below — with the
  progress bar under the table and the remaining figure colored by status.
  Rows that don't apply simply fall away, and the runtime card disappears
  entirely for tasks that don't track runtime.
- **Interval-less tasks now show their figures too.** "Last done" and "hours
  since" only ever needed a logged completion, not an interval, so a purely
  informational task now reports how long (and how many engine hours) it has
  been since it was last serviced. The new `elapsed_time_ms` field is on the
  task API alongside `elapsed_runtime`.
- **The task edit form explains its read-only fields.** Last maintenance and
  runtime-at-last-maintenance are shown with a note that they come from the
  task's most recent log entry, and that **Mark complete** (or editing the log)
  is how you change them.

## Smaller changes and fixes

- Runtime subscriptions now throttle with `minPeriod` instead of `period`.
  Pairing `period` with policy `instant` made the SignalK server log a warning
  and ignore the throttle; each path is now limited to one delta per 5s as
  intended.
- Tags moved from the description card into the task's title bar, and the
  description card is dropped entirely when a task has neither a description
  nor consumables.
- Log notes are muted wherever the log is rendered, so they read as annotation
  rather than data.
- Danger and success buttons use the theme's accent text color instead of a
  hardcoded white, which was low-contrast in some MFD themes.

# v1.1.1

A small release with one important fix for your SD card's lifespan.

## Fixes

- **Runtime updates no longer hammer the disk.** Every SignalK runtime delta
  was written straight to the database — up to several commits (and disk syncs)
  per second while the engine was running. Runtime values are now kept in
  memory and flushed in a single transaction at most once per minute, with a
  final flush on shutdown so engine hours still survive restarts.

# v1.1.0

This release teaches Maintenance Tracker to talk to your spares locker, adds
finer control over when tasks come due and warn, and makes the log easy to take
with you.

## Highlights

- **Inventory integration with signalk-stowage-mgmt.** Link the parts a task
  consumes straight to your stowage-mgmt items, see live stock badges
  (`In stock` / `Low stock` / `Out of stock`) beside each task's due-date badge,
  and have the used quantities auto-decremented from inventory when you mark a
  task complete — choosing which location(s) the stock came from when a part
  lives in more than one place. Entirely opt-in: leave the stowage-mgmt API URL
  blank and none of it activates.
- **Per-task warning windows.** Any task can override the plugin-wide "due soon"
  lead windows with its own runtime-hours and calendar-days thresholds, so a
  critical task can warn earlier without changing everything else.
- **One-time due-date deadlines.** Give a task a specific calendar due date for a
  one-off job, independent of any recurring interval.
- **Download the log.** Export the maintenance log as CSV, Markdown, or JSON from
  a format-picker in the webapp.
- **Publish task data to SignalK paths.** Beyond notifications, each task can now
  publish to `maintenance.{slug}.data` and `maintenance.{slug}.status`
  (toggleable), so dashboards can read task details directly from the SignalK
  data model.
- **Configurable alarm state per status.** Choose the SignalK alarm state
  (`none`/`normal`/`alert`/`warn`/`alarm`/`emergency`) raised for up-to-date,
  due-soon, and overdue tasks independently. The old notification "method" option
  is gone.

## Smaller changes and fixes

- Task list and detail UI cleanup: action buttons moved into a toolbar, page
  headers dropped, Tags and Next Due columns removed, Status column widened for
  badges, and larger icons and fonts for readability on chartplotters.
- Tags are now added when you Tab out of the tag input, not only on Enter.
- Device-token principals are redacted and long SignalK token usernames are
  shortened in the log's "By" column.
- The pre-commit hook now checks formatting instead of silently auto-fixing.

# v1.0.0

The first release of Maintenance Tracker! 🎉

This is a SignalK server plugin that keeps track of recurring boat
maintenance — oil changes, winch service, watermaker filters, zinc swaps,
and anything else that comes due either by engine hours, by the calendar, or
both. Install it, add your tasks, and let your boat tell you what needs doing.

## Highlights

- **Runtime and calendar intervals.** Set a task to come due after so many
  runtime hours (read live from a SignalK path like `propulsion.port.runTime`),
  after a stretch of calendar time (days/weeks/months/years), or both — whichever arrives first wins. Tasks with no interval at all work as plain informational records.
- **At-a-glance status.** Every task is `overdue`, `due soon`, `ok`, or
  `unknown`, and the task list sorts the most urgent work to the top so you
  always see what matters first.
- **A real maintenance log.** Mark a task complete and it's recorded with the
  date, who did it, and free-form markdown notes. Browse the history for a
  single task or the master log across your whole boat.
- **Notifications that show up everywhere.** Overdue and due-soon status is
  published to `notifications.maintenance.{slug}` as standard SignalK
  `alarm`/`warn`/`normal` notifications, so your existing dashboards, apps,
  and alarm consumers pick them up with no extra setup.
- **A modern webapp — that runs on old chartplotters.** A searchable,
  filterable task table with tag chips, progress bars, and a light/dark theme,
  served straight from the SignalK Webapps menu with live polling. It's a
  buildless Preact app, so it even runs on browsers as old as Chromium 69
  (Navico/B&G MFDs).
- **Logs in against SignalK itself.** The webapp authenticates through the
  server's own `/signalk/v1/auth/*` endpoints (with an optional "remember me"),
  and the server enforces API access — the plugin adds no separate accounts or
  passwords of its own.

## Under the hood

- **Zero native dependencies.** Storage uses Node's built-in `node:sqlite`, so
  there's nothing to compile — perfect for a Raspberry Pi. Requires
  **Node ≥ 22.5** (SignalK on Node 24 recommended).
- **REST API** mounted at `/plugins/signalk-maintenance-tracker/api` for tasks,
  logs, and tags — access controlled by the SignalK server.
- **Configurable notification timing.** Master on/off switch, notification
  method, and how far ahead ("due soon" lead time) to warn for both runtime
  hours and calendar days — all in the plugin config.

Thanks for trying it out — feedback and issues are very welcome.
