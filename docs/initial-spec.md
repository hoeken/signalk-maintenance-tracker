# signalk-maintenance-tracker plugin spec

This is a plugin for SignalK to manage tracking maintenance tasks for the boat.  The primary interface should be a webapp.  Through the webapp, the user can create various maintenance tasks, mark the tasks as completed, view maintenance logs, and view overdue and upcoming maintenance tasks.

Maintenance tasks are repeatable things that must be done on the boat: change the oil, service the winches, etc.  The user can create any number of tasks.  Each task should have the following data:

- name
- description (markdown compatible)
- slug, based on name.  must be unique
- runtime interval (optional, hours between required maintenance. eg: engine hours)
- time interval (optional, time between required maintenance)
- last runtime (last runtime in hours when maintance was performed. eg: engine hours)
- last maintenance (timestamp, last time maintenance was performed)
- runtime path (signalk path to runtime variable (eg. propulsion.port.runTime))
- freeform tag style category system (Engines, Winches, Watermaker, etc.)

Each task should also have an associated log of previously completed maintenace.  Each log entry should include:

- maintenance date
- runtime hours (if available)
- notes (markdown compatible)
- signalk user who logged the maintenance

## UI / Frontend

The main page of the app should be a list of maintenance tasks.  It should be a sortable and searchable table with pagination.  Default should be to show past due maintenance items, followed by upcoming maintenance items.  User can sort by name, remaining runtime, remaining time, can select or deselect tags to filter, and can freeform search to look up based on name, description, tag, or log entry text.  UI should be dynamic and live updating.  Each row should have icons to view, edit, delete, and mark complete.

Each task should have a detail page where it shows all the relevant information about a task:  name, description, tags, intervals, current elapsed time/runtime, remaining time/runtime, next due dates, tags, and log entries for that task.  It should also have a button to allow the user to mark the maintenance complete.

Editing a task should allow all of the pertinent information to be edited in a modern, responsive web app.

Deleting a task can be done via a modal box for confirmation before deleting.

Marking a task as completed should also happen through a modal box with the following editable fields:

- maintenance datetime (default now)
- maintenance runtime (from sk path, if present)
- notes

Another page should be a master log of all completed maintenance tasks.  It should also be sortable and searchable with all of the relevant fields in a tabular data format.

App should also have a light/dark mode with chooser that respects client theme on load.

## SignalK plugin backend

The plugin backend needs to have a database to track of all the maintenance tasks, log entries, tags, etc.

It also needs to subscribe to all the runtime topics (if any) and then update the relevant maintenance task

The backend will need to define api's for maintenance task CRUD, log entry CRUD, etc.

The backend should also create and update notification.maintenance.{slug}.*

## Technologies

- backend: local sqlite db for storing data
- frontend framework: **Preact** (with `htm` for templating), authored as buildless
  native ES modules — no bundler or transpile step of our own. Chosen so the webapp
  runs on Navico/B&G MFDs (Chromium 69) while progressively enhancing on modern
  browsers. End users' reverse-proxy plugin transpiles the served JS/CSS for old
  browsers; we author to an ES2017 + Chromium-69 CSS baseline. See
  [specification.md](specification.md) §3 and §7.9 for the full compatibility rules.