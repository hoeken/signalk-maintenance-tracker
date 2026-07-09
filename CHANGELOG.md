# v1.0.0

Initial release.

## Features

- Track recurring boat maintenance tasks by runtime hours, calendar time, or both
- Status tracking (`overdue` / `due soon` / `ok` / `unknown`) with the task list sorted most-urgent first
- SignalK notifications published to `notifications.maintenance.{slug}`
- Per-task history plus a master maintenance log, with markdown notes
- Buildless Preact webapp served from the SignalK webapps menu — searchable/filterable task table, light/dark theme, live polling, Chromium 69 (Navico/B&G MFD) support
- SignalK-native auth; zero native dependencies (uses Node's built-in `node:sqlite`)
