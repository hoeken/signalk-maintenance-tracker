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
