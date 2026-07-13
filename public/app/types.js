/**
 * Shared JSDoc typedefs mirroring the backend DTOs (src/types.ts, §8).
 * This module has no runtime exports; other modules reference these types
 * with `import('../types.js').TaskDTO`-style JSDoc imports.
 */

/** @typedef {'days'|'weeks'|'months'|'years'} TimeUnit */
/** @typedef {'overdue'|'due_soon'|'ok'|'unknown'} Status */

/**
 * @typedef {Object} TaskConsumableDTO
 * @property {string} item_id
 * @property {string} item_name
 * @property {number} qty_per_service
 */

/**
 * @typedef {Object} TaskDTO
 * @property {number} id
 * @property {string} slug
 * @property {string} name
 * @property {string|null} description
 * @property {string[]} tags
 * @property {number|null} runtime_interval
 * @property {number|null} time_interval
 * @property {TimeUnit|null} time_interval_unit
 * @property {string|null} runtime_path
 * @property {string|null} due_date
 * @property {string|null} last_maintenance
 * @property {number|null} last_runtime
 * @property {number|null} current_runtime
 * @property {number|null} elapsed_runtime
 * @property {number|null} remaining_runtime
 * @property {number|null} due_runtime_at
 * @property {number|null} runtime_fraction
 * @property {Status|null} runtime_status
 * @property {string|null} scheduled_due_date
 * @property {number|null} scheduled_remaining_ms
 * @property {number|null} scheduled_fraction
 * @property {Status|null} scheduled_status
 * @property {number|null} due_date_remaining_ms
 * @property {number|null} due_date_fraction
 * @property {Status|null} due_date_status
 * @property {number|null} remaining_time_ms
 * @property {number|null} time_fraction
 * @property {Status|null} time_status
 * @property {Status} status
 * @property {number} status_rank
 * @property {number} urgency
 * @property {string} created_at
 * @property {string} updated_at
 * @property {TaskConsumableDTO[]} consumables
 */

/**
 * @typedef {Object} LogDTO
 * @property {number} id
 * @property {number} task_id
 * @property {string} maintenance_date
 * @property {number|null} runtime_hours
 * @property {string|null} notes
 * @property {string|null} logged_by
 * @property {string} created_at
 * @property {string} task_slug
 * @property {string} task_name
 * @property {string[]} [consumable_warnings]
 */

/**
 * @typedef {Object} TagDTO
 * @property {number} id
 * @property {string} name
 * @property {number} count
 */

/**
 * @template T
 * @typedef {Object} Page
 * @property {T[]} data
 * @property {number} total
 * @property {number} page
 * @property {number} pageSize
 */

/**
 * @typedef {Object} TaskInput
 * @property {string} [name]
 * @property {string} [slug]
 * @property {string|null} [description]
 * @property {number|null} [runtime_interval]
 * @property {number|null} [time_interval]
 * @property {TimeUnit|null} [time_interval_unit]
 * @property {string|null} [runtime_path]
 * @property {string|null} [due_date]
 * @property {string[]} [tags]
 * @property {string|null} [last_maintenance]
 * @property {number|null} [last_runtime]
 * @property {TaskConsumableDTO[]} [consumables]
 */

/**
 * @typedef {Object} LogInput
 * @property {string} [maintenance_date]
 * @property {number|null} [runtime_hours]
 * @property {string|null} [notes]
 * @property {boolean} [consume_stock]
 * @property {{ item_id: string, placements: { placement_id: string, quantity: number }[] }[]} [consumable_allocations]
 */

export {};
