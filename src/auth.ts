/**
 * Read the SignalK request principal's identifier, used only to stamp
 * log_entries.logged_by (§9.1). The plugin does no authorization of its own —
 * SignalK enforces access before requests reach our handlers.
 *
 * The exact field varies across signalk-server versions, so every known shape
 * is probed here and nowhere else.
 */
export function getRequestUser(req: unknown): string | null {
  const r = req as Record<string, any>;
  return (
    r?.skPrincipal?.identifier ??
    r?.skUser?.id ??
    r?.skUser?.username ??
    r?.user?.id ??
    r?.user?.username ??
    (typeof r?.user === 'string' ? r.user : null) ??
    null
  );
}
