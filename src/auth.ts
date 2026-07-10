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

/**
 * Device-token principals identify as a raw UUID (e.g.
 * "158dccd5-f82c-42a3-9909-42ac7d3c8e88") rather than a human username. The
 * read-only API may be public, so the full identifier must never leave the
 * server: shorten tokens to their first segment before serializing. Human
 * usernames pass through unchanged.
 */
const TOKEN_USER_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function publicUser(loggedBy: string | null): string | null {
  if (!loggedBy) return loggedBy;
  return TOKEN_USER_RE.test(loggedBy) ? loggedBy.slice(0, 8) : loggedBy;
}
