# v1.5

- add support for one-off TODO list type entries
  - start by adding an is_recurring boolean flag (stored column, not derived)
    - migration: tasks with a runtime or time interval -> true, all others -> false
    - note: schedule-less "tracker" tasks become todos; if one was truly
      recurring the user can set an interval, otherwise just unarchive it
      when the work comes around again
  - rename the 'info' status to 'pending'
    - pending = recurring task that can't compute a status yet:
      - runtime interval set but no runtime reading / last_runtime
      - time interval set but no last_maintenance logged
    - pending raises no notification (same as 'info' today)
  - if !is_recurring, then it is a todo list item
    - todos can have an optional due date
      - with a due date: overdue / due soon / todo / archived (completed)
      - without one: todo / archived
    - due date remains an optional field on recurring tasks too (one-time
      deadline, unchanged behavior)
    - 'todo' status raises no notification; a todo's overdue / due soon
      states notify as usual via the due date dimension
  - sort order should be overdue -> due soon -> todo -> ok -> pending -> archived
  - badges: todo = blue (takes over the current info/accent style);
    pending gets a distinct muted color
  - modify existing New Task modal to support 'Is Recurring?'
    - move Due Date row above our interval fields
    - dynamically toggle our intervals, runtime warning, runtime path,
      last maintenance, and last runtime fields based on is_recurring
      - keep the time warning (days) field visible for todos: it drives
        the due-soon window of the due date
    - New Task -> defaults to is_recurring = true
    - for recurring tasks, one of the 2 interval fields becomes mandatory:
      - runtime interval, time interval
  - enforce the invariants server-side too (the API can bypass the modal):
    - is_recurring = false -> reject/null runtime_interval, time_interval,
      runtime_path
    - is_recurring = true -> require at least one interval
  - add a 'New Todo' button next to 'New Task'
    - reuse the same 'new task' modal, but default to is_recurring = false
  - when a todo item (eg. non-recurring) is marked completed, it should transition into the 'archived' state
    - completing still clears due_date (existing behavior); user sets a new
      one if they reopen the todo
    - unarchive = reopen
    - hide the runtime hours field in the complete/log modal for todos
  - update spec (docs/specification.md §6), status tests, and frontend
    STATUSES / labels / filter chips for the pending + todo statuses

# Long Term

- responsibility assignment
  - assign a crew to each maintenance task
    - username? crewnames?
  - each crew could have a customized page with their tasks
