# 1.1.0

- tags page
- publish tasks to maintenance.{slug}.*
- fix small spacing typos on task detail page:
  - Runtime — every250 h
  - Current 1620.1 h · last done at 1300 h · due at1550 h
  - Time — every 6months
  - Last done 2026-07-09 · next due2027-01-09

# 1.2.0

- integration with signalk-stowage-mgmt
  - list of item + quantity -> choose from list pulled from stowage API
  - on complete, mark each one as decremented by qty

- responsibility assignment
  - assign a crew to each maintenance task
    - username? crewnames?
  - each crew could have a customized page with their tasks
