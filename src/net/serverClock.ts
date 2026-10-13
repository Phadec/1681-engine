/*
 * The server's clock, as this client best knows it. Everything the game reckons from wall time — the time of day,
 * the weather, timetables, daily resets — reads `serverNow()` instead
 * of `Date.now()`, so a phone whose clock is a few minutes off still sees the sky and the resets everyone else sees.
 *
 * The offset comes from timed exchanges: every pong (the server's time when it answered, against the ping's own
 * round trip) and any request that returns the server's time. The sample with the shortest round trip wins, since its
 * midpoint is the tightest guess; a sample older than a minute gives way to the next one so a drifting clock is
 * followed. Until the first one lands this device's own clock stands in (a game clock counting from the server's start must never
 * seed this). An offline game is its own server, so there the offset is zero.
 */

/** A timed sample this old gives way to a new one, even a slower one. */
const STALE_MS = 60_000;
/** A sample whose round trip took longer than this says too little about when the server answered: it is passed over. */
export const MAX_SAMPLE_RTT_MS = 2000;

let offset = 0;
let bestRtt = Infinity;
let takenAt = 0;
let timed = false;

/** Server wall time now, in ms since the epoch. */
export function serverNow(): number {
  return Date.now() + offset;
}

/** The current estimate of server time minus this device's time, in ms. */
export function serverOffset(): number {
  return offset;
}

/**
 * A server timestamp `serverMs` taken halfway through an exchange that took `rttMs` to come back: the server's clock
 * then stood at `serverMs + rttMs / 2` of this device's now.
 */
export function noteServerTime(serverMs: number, rttMs: number, now = Date.now()): void {
  if (!Number.isFinite(serverMs) || !Number.isFinite(rttMs) || rttMs < 0 || rttMs > MAX_SAMPLE_RTT_MS) return;
  if (timed && rttMs > bestRtt && now - takenAt < STALE_MS) return;
  offset = serverMs + rttMs / 2 - now;
  bestRtt = rttMs;
  takenAt = now;
  timed = true;
}

/** Back to this device's own clock (offline, or leaving a server). */
export function resetServerClock(): void {
  offset = 0;
  bestRtt = Infinity;
  takenAt = 0;
  timed = false;
}
