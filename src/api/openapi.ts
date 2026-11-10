/** Signal K publishes this document through the plugin getOpenApi hook. */
type Schema = Record<string, any>;
const ref = (name: string): Schema => ({
  $ref: `#/components/schemas/${name}`,
});
const string = (description?: string): Schema => ({
  type: 'string',
  ...(description ? { description } : {}),
});
const number = (description?: string): Schema => ({
  type: 'number',
  ...(description ? { description } : {}),
});
const integer: Schema = { type: 'integer' };
const boolean: Schema = { type: 'boolean' };
const nullable = (schema: Schema): Schema => ({
  ...schema,
  nullable: true,
  ...(schema.enum ? { enum: [...schema.enum, null] } : {}),
});
const array = (items: Schema): Schema => ({ type: 'array', items });
const object = (
  properties: Record<string, Schema>,
  required = Object.keys(properties),
): Schema => ({
  type: 'object',
  properties,
  ...(required.length ? { required } : {}),
});
const input = (
  properties: Record<string, Schema>,
  required: string[] = [],
): Schema => ({ ...object(properties, required), additionalProperties: false });
const amount = (description: string): Schema =>
  nullable({ ...number(description), minimum: 0 });
const positive = (description: string): Schema => ({
  ...number(description),
  minimum: 0,
  exclusiveMinimum: true,
});
const date = string(
  'ISO-8601 date or timestamp; parsed and normalized to UTC by the service.',
);
const status: Schema = {
  type: 'string',
  enum: ['overdue', 'due_soon', 'todo', 'ok', 'pending', 'archived'],
};
const timeUnit: Schema = {
  type: 'string',
  nullable: true,
  enum: ['days', 'weeks', 'months', 'years', null],
};

const taskInput = {
  name: {
    ...string('Non-blank task name, trimmed by the service.'),
    minLength: 1,
  },
  slug: string(
    'Optional slug, normalized to lowercase ASCII with hyphens. Omit on create to derive a unique slug from the name.',
  ),
  description: nullable(string('Task description (Markdown).')),
  runtime_interval: nullable(positive('Recurring interval in hours.')),
  time_interval: nullable(
    positive(
      'Recurring calendar interval. Set or clear together with time_interval_unit.',
    ),
  ),
  time_interval_unit: timeUnit,
  runtime_path: nullable(
    string('Signal K runtime path. The service uses runtime values in hours.'),
  ),
  due_date: nullable({
    ...date,
    description:
      'One-time deadline. Null or an empty string clears it; completing the task also clears it.',
  }),
  runtime_warning_hours: amount(
    'Hours before due to warn; null uses the plugin default, zero disables the warning window.',
  ),
  time_warning_days: amount(
    'Days before due to warn; null uses the plugin default, zero disables the warning window.',
  ),
  tags: {
    ...array(string()),
    description: 'Replaces all tags when supplied; an empty array clears them.',
  },
  last_maintenance: nullable(
    string(
      'Initial maintenance timestamp. Updates are ignored once the task has log entries.',
    ),
  ),
  last_runtime: nullable(
    number(
      'Initial runtime reading in hours. Updates are ignored once the task has log entries.',
    ),
  ),
  is_archived: {
    ...boolean,
    description:
      'Archive or reopen the task. Archived tasks do not raise notifications.',
  },
  is_recurring: {
    ...boolean,
    description:
      'On create, inferred from intervals if omitted. Recurring tasks need at least one interval. False requires no intervals/runtime path; changing to false clears the existing schedule.',
  },
  estimated_hours: amount(
    'Estimated labour per completion in decimal hours; null clears it.',
  ),
  estimated_cost: amount(
    'Estimated cost per completion, with no currency conversion; null clears it.',
  ),
  consumables: {
    ...array(ref('Consumable')),
    description:
      'Replaces all linked stowage items when supplied; an empty array clears them.',
  },
};

const logInput = {
  maintenance_date: date,
  runtime_hours: nullable(number('Runtime reading at maintenance, in hours.')),
  notes: nullable(string('Maintenance notes (Markdown).')),
  actual_hours: amount(
    'Actual labour in decimal hours; null means not recorded.',
  ),
  actual_cost: amount(
    'Actual cost, with no currency conversion; null means not recorded.',
  ),
};
const logProperties = {
  id: integer,
  task_id: nullable(integer),
  title: nullable(
    string('Standalone entry title; null for task-linked entries.'),
  ),
  maintenance_date: string('Maintenance timestamp normalized to UTC.'),
  runtime_hours: logInput.runtime_hours,
  notes: logInput.notes,
  logged_by: nullable(
    string(
      'Recorded from the Signal K principal, never supplied in the body. Device UUIDs are shortened in responses.',
    ),
  ),
  actual_hours: logInput.actual_hours,
  actual_cost: logInput.actual_cost,
  created_at: string(),
  updated_at: nullable(string('Null until an edit changes the entry.')),
  files: array(ref('File')),
};
const computed = {
  current_runtime: nullable(
    number('Current runtime in hours; null when unavailable.'),
  ),
  elapsed_runtime: nullable(number('Hours since last maintenance.')),
  remaining_runtime: nullable(
    number('Hours until the recurring runtime interval is due.'),
  ),
  due_runtime_at: nullable(
    number('Runtime reading in hours at which maintenance is due.'),
  ),
  runtime_fraction: nullable(number()),
  runtime_status: nullable(status),
  elapsed_time_ms: nullable(number('Milliseconds since last maintenance.')),
  scheduled_due_date: nullable(string()),
  scheduled_remaining_ms: nullable(number()),
  scheduled_fraction: nullable(number()),
  scheduled_status: nullable(status),
  due_date_remaining_ms: nullable(number()),
  due_date_fraction: nullable(number()),
  due_date_status: nullable(status),
  remaining_time_ms: nullable(
    number('Remaining milliseconds for the more urgent time deadline.'),
  ),
  time_fraction: nullable(number()),
  time_status: nullable(status),
  status,
  status_rank: integer,
  urgency: nullable(
    number(
      'Highest known due fraction; null when no fraction is available (the internal negative-infinity sort sentinel serializes as null).',
    ),
  ),
};
const page = (item: string, stats: Schema): Schema =>
  object({
    data: array(ref(item)),
    total: integer,
    page: integer,
    pageSize: integer,
    stats,
  });
const data = (item: string): Schema => object({ data: array(ref(item)) });
const schemas: Record<string, Schema> = {
  Error: object({ error: object({ code: string(), message: string() }) }),
  Consumable: input(
    {
      item_id: { ...string(), minLength: 1 },
      item_name: { ...string(), minLength: 1 },
      qty_per_service: positive('Quantity consumed per completion by default.'),
    },
    ['item_id', 'item_name', 'qty_per_service'],
  ),
  CreateTask: input(taskInput, ['name']),
  UpdateTask: input(taskInput),
  Task: object({
    ...taskInput,
    id: integer,
    slug: string(),
    name: string(),
    created_at: string(),
    updated_at: string(),
    files: array(ref('File')),
    ...computed,
  }),
  CreateTaskLog: input(
    {
      ...logInput,
      consume_stock: {
        ...boolean,
        default: true,
        description:
          'False skips inventory consumption. Otherwise linked stowage stock is consumed when the integration is configured.',
      },
      consumable_quantities: {
        ...array(
          input(
            {
              item_id: string(),
              quantity: positive('Quantity actually consumed.'),
            },
            ['item_id', 'quantity'],
          ),
        ),
        description:
          'When present, consume only listed linked items at these quantities. Empty skips all items; unlinked IDs are ignored. Omit to consume every linked item at qty_per_service.',
      },
      consumable_allocations: {
        ...array(
          input(
            {
              item_id: string(),
              placements: array(
                input({ placement_id: string(), quantity: number() }, [
                  'placement_id',
                  'quantity',
                ]),
              ),
            },
            ['item_id', 'placements'],
          ),
        ),
        description:
          'Explicit placement allocation for split stock; allocations are forwarded to stowage-mgmt. Omitted items use a plain quantity decrement, which may return a warning for split stock.',
      },
    },
    ['maintenance_date'],
  ),
  CreateStandaloneLog: input(
    {
      ...logInput,
      title: { ...string('Non-blank standalone entry title.'), minLength: 1 },
    },
    ['title', 'maintenance_date'],
  ),
  UpdateLog: input({
    ...logInput,
    title: {
      ...string(
        'Non-blank title for standalone entries; ignored for task-linked entries.',
      ),
      minLength: 1,
    },
  }),
  LogEntry: object(logProperties),
  LogResult: object(
    { ...logProperties, consumable_warnings: array(string()) },
    Object.keys(logProperties),
  ),
  MasterLogEntry: object({
    ...logProperties,
    task_slug: nullable(string()),
    task_name: nullable(string()),
  }),
  File: object({
    id: integer,
    name: string(),
    size: { ...integer, description: 'Size in bytes.' },
    mime: nullable(string()),
    created_at: string(),
  }),
  Tag: object({ id: integer, name: string(), count: integer }),
  Aggregate: object({
    total: number(),
    count: integer,
    average: nullable(number()),
  }),
  WorkStats: object({ hours: ref('Aggregate'), cost: ref('Aggregate') }),
  TaskPage: page(
    'Task',
    object({ estimated: ref('WorkStats'), actual: ref('WorkStats') }),
  ),
  LogPage: page('MasterLogEntry', ref('WorkStats')),
  TaskLogs: data('LogEntry'),
  Files: data('File'),
  Tags: data('Tag'),
  Stats: object({
    estimated: ref('WorkStats'),
    actual: ref('WorkStats'),
    tasks: array(
      object({
        slug: string(),
        name: string(),
        is_archived: boolean,
        is_recurring: boolean,
        estimated_hours: taskInput.estimated_hours,
        estimated_cost: taskInput.estimated_cost,
        log_count: integer,
        actual: ref('WorkStats'),
      }),
    ),
    standalone: object({ log_count: integer, actual: ref('WorkStats') }),
  }),
  Health: object({
    tasks: integer,
    logEntries: integer,
    runtimePaths: array(string()),
    defaults: object({
      runtime_warning_hours: number(),
      time_warning_days: number(),
    }),
    subscribedPaths: array(string()),
    lastRuntimeUpdate: nullable(string()),
    version: string(),
  }),
};

const parameter = (
  name: string,
  schema: Schema,
  description: string,
): Schema => ({ name, in: 'query', description, schema });
const pathParameter = (name: string, schema: Schema): Schema => ({
  name,
  in: 'path',
  required: true,
  schema,
});
const slug = pathParameter('slug', string('Task slug returned by the API.'));
const id = pathParameter('id', integer);
// Public parameter name avoids treating an attachment ID as a file path.
const attachmentId = pathParameter('attachmentId', integer);
const paging = [
  parameter(
    'page',
    { type: 'integer', default: 1 },
    'Page number; values below 1 are clamped to 1.',
  ),
  parameter(
    'pageSize',
    { type: 'integer', default: 20 },
    'Items per page; clamped to 1–200.',
  ),
];
const order = parameter(
  'order',
  { type: 'string', enum: ['asc', 'desc'] },
  'Sort direction; defaults to ascending for tasks and descending for the master log.',
);
const search = parameter(
  'search',
  string(),
  'Case-insensitive search; task search includes name, description, tags, status and log notes. Master log search includes task name, standalone title, notes and logged_by.',
);
const jsonResponse = (name: string, description: string): Schema => ({
  description,
  content: { 'application/json': { schema: ref(name) } },
});
const errors = {
  '400': jsonResponse('Error', 'Invalid input.'),
  '404': jsonResponse('Error', 'Task, log entry or attachment not found.'),
  '500': jsonResponse('Error', 'Internal service error.'),
  '503': jsonResponse(
    'Error',
    'Plugin not started or attachment storage unavailable.',
  ),
};
function operation(
  operationId: string,
  summary: string,
  response: string | null,
  options: {
    description?: string;
    body?: string;
    created?: boolean;
    conflict?: boolean;
    parameters?: Schema[];
  } = {},
): Schema {
  return {
    operationId,
    summary,
    ...(options.description ? { description: options.description } : {}),
    ...(options.parameters ? { parameters: options.parameters } : {}),
    ...(options.body
      ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref(options.body) } },
          },
        }
      : {}),
    responses: {
      ...(response
        ? {
            [options.created ? '201' : '200']: jsonResponse(
              response,
              options.created ? 'Created.' : 'Success.',
            ),
          }
        : { '204': { description: 'Deleted. No response body.' } }),
      ...errors,
      ...(options.conflict
        ? { '409': jsonResponse('Error', 'Task slug already exists.') }
        : {}),
    },
  };
}
function upload(operationId: string, summary: string): Schema {
  return {
    ...operation(operationId, summary, 'File', { created: true }),
    description:
      'Streams raw file bytes, not JSON or multipart. Requires Content-Length and a percent-encoded X-File-Name. Maximum size is 1 GiB. Not a JSON MCP operation.',
    parameters: [
      {
        name: 'Content-Length',
        in: 'header',
        required: true,
        schema: { type: 'integer', minimum: 0, maximum: 1073741824 },
      },
      {
        name: 'X-File-Name',
        in: 'header',
        required: true,
        schema: string('Percent-encoded original filename.'),
      },
      {
        name: 'X-File-Type',
        in: 'header',
        schema: string('Original MIME type, stored as metadata.'),
      },
    ],
    requestBody: {
      required: true,
      content: {
        'application/octet-stream': {
          schema: { type: 'string', format: 'binary' },
        },
      },
    },
    responses: {
      ...operation(operationId, summary, 'File', { created: true }).responses,
      '411': jsonResponse('Error', 'Content-Length is required.'),
      '413': jsonResponse('Error', 'Attachment exceeds the size limit.'),
    },
  };
}
function download(operationId: string, summary: string): Schema {
  return {
    ...operation(operationId, summary, null),
    description:
      'Returns file bytes, not JSON. Safe types are served inline, other types as downloads. Content-Type follows stored metadata for inline files. Not a JSON MCP operation.',
    responses: {
      '200': {
        description: 'Attachment bytes.',
        headers: {
          'Content-Disposition': { schema: string() },
          'X-Content-Type-Options': {
            schema: string(),
            description: 'nosniff',
          },
        },
        content: { '*/*': { schema: { type: 'string', format: 'binary' } } },
      },
      ...errors,
    },
  };
}

/** Paths are relative to the plugin mount, including its existing /api prefix. */
export function getOpenApi(version: string) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Signal K Maintenance Tracker',
      version,
      description:
        'Maintenance tasks, completion logs, attachments and provider-computed statistics. Runtime quantities use hours; elapsed/remaining time fields ending in _ms use milliseconds. Null means unavailable or not recorded, not zero. Signal K enforces route access before these handlers; this document does not grant permission. Authentication errors are owned by the host and may not use the plugin error envelope. MCP clients must separately review and approve each operation.',
    },
    servers: [{ url: '/plugins/signalk-maintenance-tracker' }],
    components: {
      schemas,
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description:
            'Existing Signal K bearer token. Native Signal K access policy applies; browser clients may use the host session instead.',
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      '/api/tasks': {
        get: operation('listTasks', 'List maintenance tasks', 'TaskPage', {
          description:
            'Provider-computed task status and work statistics across all matching tasks, plus one page of results. Defaults to status/urgency ordering. Archived tasks are included unless filtered out.',
          parameters: [
            search,
            parameter(
              'tags',
              string(),
              'Comma-separated tags; all must match, case-insensitively.',
            ),
            parameter(
              'status',
              string(),
              'Comma-separated statuses: overdue, due_soon, todo, ok, pending, archived. Unknown values are ignored.',
            ),
            parameter(
              'sort',
              {
                type: 'string',
                enum: ['name', 'remaining_runtime', 'remaining_time', 'status'],
              },
              'Sort key; defaults to status/urgency.',
            ),
            order,
            ...paging,
          ],
        }),
        post: operation('createTask', 'Create a maintenance task', 'Task', {
          body: 'CreateTask',
          created: true,
          conflict: true,
          description:
            'Creates a task and refreshes runtime subscriptions, published status and notifications. Interval/unit and recurring/todo consistency are validated by the service.',
        }),
      },
      '/api/tasks/{slug}': {
        parameters: [slug],
        get: operation('getTask', 'Get a maintenance task', 'Task'),
        put: operation('updateTask', 'Update a maintenance task', 'Task', {
          body: 'UpdateTask',
          conflict: true,
          description:
            'Partial update despite the PUT method: omitted fields are preserved. Supplied tags and consumables replace their collections. Renaming a slug migrates published status/notifications; changing to a todo clears the existing schedule. Seed last-maintenance values can only change before any log entries exist. Refreshes runtime subscriptions, status and notifications.',
        }),
        delete: operation('deleteTask', 'Delete a task and its history', null, {
          description:
            'Permanently deletes the task, its log entries and all task/log attachment files, prunes unused tags and clears its published status/notifications.',
        }),
      },
      '/api/tasks/{slug}/logs': {
        parameters: [slug],
        get: operation(
          'listTaskLogs',
          'List a task’s maintenance logs',
          'TaskLogs',
          {
            description:
              'All log entries for this task, newest maintenance date first; not paginated.',
          },
        ),
        post: operation(
          'completeTask',
          'Record maintenance and complete a task',
          'LogResult',
          {
            body: 'CreateTaskLog',
            created: true,
            description:
              'Creates a log entry with the caller as logged_by, recomputes last maintenance/runtime, clears the one-time due date and archives a one-off todo. Refreshes published status and notifications. By default also consumes linked stowage inventory using the caller’s credentials when configured; consume_stock=false skips this. Inventory failures do not roll back completion and may appear as consumable_warnings. Retrying creates another log and may consume stock again.',
          },
        ),
      },
      '/api/logs': {
        get: operation(
          'listLogs',
          'List the master maintenance log',
          'LogPage',
          {
            description:
              'One page of task-linked and standalone entries, with provider-computed actual work statistics over all matching entries.',
            parameters: [
              search,
              parameter(
                'sort',
                {
                  type: 'string',
                  enum: ['maintenance_date', 'task', 'runtime_hours'],
                },
                'Sort key; defaults to maintenance_date.',
              ),
              order,
              ...paging,
            ],
          },
        ),
        post: operation(
          'createStandaloneLog',
          'Create a standalone maintenance log',
          'LogEntry',
          {
            body: 'CreateStandaloneLog',
            created: true,
            description:
              'Records work without a task; stamps logged_by from the caller. Does not consume inventory, clear a task deadline or archive a task.',
          },
        ),
      },
      '/api/logs/{id}': {
        parameters: [id],
        put: operation('updateLog', 'Update a maintenance log', 'LogEntry', {
          body: 'UpdateLog',
          description:
            'Partial update: omitted fields are preserved. Recomputes the linked task’s last maintenance/runtime and notifications. Does not consume or restore inventory, restore a deadline or reopen a task. Cannot change task_id or logged_by.',
        }),
        delete: operation(
          'deleteLog',
          'Delete a maintenance log and its attachments',
          null,
          {
            description:
              'Permanently deletes the entry and its attachment files. Recomputes the linked task’s last maintenance/runtime and notifications. Does not restore consumed inventory, the cleared deadline or the task’s open state.',
          },
        ),
      },
      '/api/tasks/{slug}/files': {
        parameters: [slug],
        get: operation(
          'listTaskFiles',
          'List task attachment metadata',
          'Files',
        ),
        post: upload('uploadTaskFile', 'Upload a task attachment'),
      },
      '/api/tasks/{slug}/files/{id}': {
        parameters: [slug, id],
        get: download('downloadTaskFile', 'Download a task attachment'),
        delete: operation('deleteTaskFile', 'Delete a task attachment', null, {
          description:
            'Permanently deletes attachment metadata and bytes from this task.',
        }),
      },
      '/api/logs/{id}/files': {
        parameters: [id],
        get: operation('listLogFiles', 'List log attachment metadata', 'Files'),
        post: upload('uploadLogFile', 'Upload a log attachment'),
      },
      '/api/logs/{id}/files/{attachmentId}': {
        parameters: [id, attachmentId],
        get: download('downloadLogFile', 'Download a log attachment'),
        delete: operation('deleteLogFile', 'Delete a log attachment', null, {
          description:
            'Permanently deletes attachment metadata and bytes from this log entry.',
        }),
      },
      '/api/tags': {
        get: operation('listTags', 'List tags and task counts', 'Tags'),
      },
      '/api/stats': {
        get: operation('getStats', 'Get maintenance work statistics', 'Stats', {
          description:
            'Provider-computed estimates across tasks and actuals across all log entries, including standalone entries. Averages are null when no values were recorded.',
        }),
      },
      '/api/health': {
        get: operation(
          'getHealth',
          'Get maintenance tracker health',
          'Health',
          {
            description:
              'Task/log counts, runtime path subscriptions, last runtime update, warning defaults and package version. This is plugin status, not proof of hardware health.',
          },
        ),
      },
    },
  };
}
