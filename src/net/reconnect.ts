/** The pure decisions behind `Connection`'s reconnecting, apart so they are tested without a socket. */

/** The wait before reconnect attempt `attempt` (0 first): doubling from `baseMs`, never past `maxMs`. */
export function reconnectDelay(attempt: number, maxMs = 10_000, baseMs = 250): number {
  return Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt));
}

/**
 * Whether a socket that closed with `code` should reconnect by itself: not when we closed it, not when reconnecting is
 * off, and not on a code the server uses to say "do not come back" (kicked, banned, an outdated client) — retrying
 * those only loops.
 */
export function shouldReconnect(code: number, o: { closedByUs: boolean; reconnect?: boolean; fatalCloseCodes?: readonly number[] }): boolean {
  if (o.closedByUs || o.reconnect === false) return false;
  return !o.fatalCloseCodes?.includes(code);
}
