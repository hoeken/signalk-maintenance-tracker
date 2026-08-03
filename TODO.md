# v1.5

- add support for one-off TODO list type entries
  - start by adding an isRecurring boolean flag.
    - default all existing tasks with an interval field to true
    - default all existing tasks without to false
    - tasks that are currently set as 'info' will become 'todo' items instead
  - if !isRecurring, then it is a todo list item
    - todo lists can have a due date.
      if they have a due date, then they can have one of these states: overdue / due soon / todo / archived (completed)
    - if no due date, they can either be todo / archived
  - sort order should be overdue -> due soon -> todo -> ok -> archived
    - drop the 'info' status.
  - todo badge should be blue/info
  - modify existing New Task modal to support 'Is Recurring?'
    - move Due Date row above our interval fields
    - dynamically toggle our intervals, warning period, runtime path, last maintenance, and last runtime fields based on isRecurring
    - New Task -> defaults to isRecurring = true
    - one of the 3 due date fields should become mandatory:
      - runtime interval, time interval
  - add a 'New Todo' button next to 'New Task'
    - reuse the same 'new task' modal, but default to isRecurring = false
  - when a todo item (eg. non-recurring) is marked completed, it should transition into the 'archived' state

  - add support for non-task based log entries
    - add a 'New Log Entry' button to master log page
      - btn-success
    - add title field + show this instead of task name in log
    - keep date + runtime + notes field
    - non-task based entries do not have a task id, only a static name
    - add edit/delete buttons from the task detail page log


# Long Term

- responsibility assignment
  - assign a crew to each maintenance task
    - username? crewnames?
  - each crew could have a customized page with their tasks
