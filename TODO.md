# 1.1.0

- token users show as a massive username (eg. 158dccd5-f82c-42a3-9909-42ac7d3c8e88). detect that its a token and shorten it.

- publish tasks to signalk paths
  - add boolean publishPaths config option to the schema
  - default true
  - paths in the form of maintenance.{slug}.*
  - publish the same task json that we use in /tasks api under maintenance.{slug}.data
  - publish status at maintenance.{slug}.status

- notifications
  - remove the alert notification type.
  - add boolean config option publishNotifications to enable/disable notification publication
  - default true
  - add configuration dropdowns to select the default alarm state for our various task states:
    - sk alarm states: "normal" | "alert" | "warn" | "alarm" | "emergency"
    - default them to what we're currently using

# 1.2.0

- integration with signalk-stowage-mgmt
  - list of item + quantity -> choose from list pulled from stowage API
  - on complete, mark each one as decremented by qty

- responsibility assignment
  - assign a crew to each maintenance task
    - username? crewnames?
  - each crew could have a customized page with their tasks
