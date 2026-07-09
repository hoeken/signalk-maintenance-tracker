import type { NextFunction, Request, Response, Router } from 'express';
import { getRequestUser } from '../auth';
import { ApiError, MaintenanceService, TaskListQuery } from '../service';
import { RuntimeManager } from '../signalk/runtime';
import { Status } from '../types';

export interface Services {
  service: MaintenanceService;
  runtime: RuntimeManager;
  version: string;
}

type Handler = (req: Request, res: Response) => void;

/**
 * Mounts the plugin REST API (§8) on the router SignalK provides via
 * registerWithRouter. The router is mounted at /plugins/{pluginId}, so routes
 * here live under /api/*.
 *
 * No authorization here by design (§9): SignalK gates access to these routes
 * before requests reach us.
 */
export function mountApi(
  router: Router,
  getServices: () => Services | null,
): void {
  router.use(jsonBody);

  const withServices =
    (fn: (s: Services, req: Request, res: Response) => void): Handler =>
    (req, res) => {
      const services = getServices();
      if (!services) {
        res.status(503).json({
          error: { code: 'not_started', message: 'Plugin is not started' },
        });
        return;
      }
      try {
        fn(services, req, res);
      } catch (err) {
        if (err instanceof ApiError) {
          res
            .status(err.status)
            .json({ error: { code: err.code, message: err.message } });
        } else {
          res.status(500).json({
            error: {
              code: 'internal',
              message: err instanceof Error ? err.message : String(err),
            },
          });
        }
      }
    };

  // ---- tasks (§8.1) ----

  router.get(
    '/api/tasks',
    withServices((s, req, res) => {
      res.json(s.service.listTasks(parseTaskListQuery(req)));
    }),
  );

  router.post(
    '/api/tasks',
    withServices((s, req, res) => {
      res.status(201).json(s.service.createTask(req.body ?? {}));
    }),
  );

  router.get(
    '/api/tasks/:slug',
    withServices((s, req, res) => {
      res.json(s.service.getTask(req.params.slug));
    }),
  );

  router.put(
    '/api/tasks/:slug',
    withServices((s, req, res) => {
      res.json(s.service.updateTask(req.params.slug, req.body ?? {}));
    }),
  );

  router.delete(
    '/api/tasks/:slug',
    withServices((s, req, res) => {
      s.service.deleteTask(req.params.slug);
      res.status(204).end();
    }),
  );

  // ---- logs (§8.2) ----

  router.get(
    '/api/tasks/:slug/logs',
    withServices((s, req, res) => {
      res.json({ data: s.service.listTaskLogs(req.params.slug) });
    }),
  );

  router.post(
    '/api/tasks/:slug/logs',
    withServices((s, req, res) => {
      // logged_by comes from the SignalK principal, never the body (§9.1)
      const entry = s.service.addLog(
        req.params.slug,
        req.body ?? {},
        getRequestUser(req),
      );
      res.status(201).json(entry);
    }),
  );

  router.get(
    '/api/logs',
    withServices((s, req, res) => {
      const { page, pageSize } = parsePaging(req);
      const sort = pickEnum(req.query.sort, [
        'maintenance_date',
        'task',
        'runtime_hours',
      ] as const);
      const order = pickEnum(req.query.order, ['asc', 'desc'] as const);
      res.json(
        s.service.listMasterLog({
          search: str(req.query.search),
          sort,
          order,
          page,
          pageSize,
        }),
      );
    }),
  );

  router.put(
    '/api/logs/:id',
    withServices((s, req, res) => {
      res.json(s.service.updateLog(intParam(req.params.id), req.body ?? {}));
    }),
  );

  router.delete(
    '/api/logs/:id',
    withServices((s, req, res) => {
      s.service.deleteLog(intParam(req.params.id));
      res.status(204).end();
    }),
  );

  // ---- tags (§8.3) ----

  router.get(
    '/api/tags',
    withServices((s, _req, res) => {
      res.json({ data: s.service.listTags() });
    }),
  );

  // ---- health (§8.5) ----

  router.get(
    '/api/health',
    withServices((s, _req, res) => {
      res.json({
        ...s.service.health(),
        subscribedPaths: s.runtime.subscribedPaths,
        lastRuntimeUpdate: s.runtime.lastUpdateAt,
        version: s.version,
      });
    }),
  );
}

/**
 * Minimal JSON body reader. SignalK versions differ on whether plugin routers
 * get body-parsing middleware, so parse only if req.body is still unset.
 */
function jsonBody(req: Request, res: Response, next: NextFunction): void {
  if (
    req.body !== undefined ||
    req.method === 'GET' ||
    req.method === 'DELETE'
  ) {
    next();
    return;
  }
  let data = '';
  req.setEncoding('utf8');
  req.on('data', (chunk: string) => {
    data += chunk;
  });
  req.on('end', () => {
    if (!data) {
      req.body = {};
      next();
      return;
    }
    try {
      req.body = JSON.parse(data);
      next();
    } catch {
      res.status(400).json({
        error: {
          code: 'invalid_json',
          message: 'Request body is not valid JSON',
        },
      });
    }
  });
}

function parseTaskListQuery(req: Request): TaskListQuery {
  const { page, pageSize } = parsePaging(req);
  return {
    search: str(req.query.search),
    tags: csv(req.query.tags),
    status: csv(req.query.status)?.filter((s): s is Status =>
      ['overdue', 'due_soon', 'ok', 'unknown'].includes(s),
    ),
    sort: pickEnum(req.query.sort, [
      'name',
      'remaining_runtime',
      'remaining_time',
      'status',
    ] as const),
    order: pickEnum(req.query.order, ['asc', 'desc'] as const),
    page,
    pageSize,
  };
}

function parsePaging(req: Request): { page?: number; pageSize?: number } {
  return { page: int(req.query.page), pageSize: int(req.query.pageSize) };
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

function csv(v: unknown): string[] | undefined {
  const s = str(v);
  return s
    ? s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    : undefined;
}

function int(v: unknown): number | undefined {
  const s = str(v);
  if (s === undefined) return undefined;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : undefined;
}

function intParam(v: string): number {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n))
    throw new ApiError(400, 'invalid_id', 'id must be an integer');
  return n;
}

function pickEnum<T extends string>(
  v: unknown,
  allowed: readonly T[],
): T | undefined {
  const s = str(v);
  return s !== undefined && (allowed as readonly string[]).includes(s)
    ? (s as T)
    : undefined;
}
