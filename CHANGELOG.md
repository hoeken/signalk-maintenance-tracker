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
