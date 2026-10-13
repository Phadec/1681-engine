/*
 * Cleans one recorded take (`SampleBank`): folded to mono, the silence an encoder or the model leaves at the start cut
 * (a swing heard 30 ms late reads as lag) and at the end trimmed, and brought to one loudness (`LOUDNESS`, RMS of what
 * is left, never past `PEAK`), so takes from different prompts sit at one level. Pure: run in `takeCleanerWorker.ts`,
 * because on the main thread the first blows of a fight froze the game 70–170 ms a take on a Mac and several times
 * that on a phone (profiled).
 */

/** Below this share of the take's own peak a sample counts as silence when trimming (-40 dB). */
const FLOOR = 0.01;
/** A take whose peak is under this is treated as empty (about -46 dBFS): the model returned near-silence. */
const EMPTY = 0.005;
/** Target RMS of a cleaned take (-16 dBFS) and the peak it may not pass. */
const LOUDNESS = 0.16;
const PEAK = 0.95;
/** Kept before the first loud sample, so the attack is not clipped into a click (s). */
const LEAD = 0.002;
/** A short fade over the cut end, so a trimmed tail does not click (s). */
const TAIL_FADE = 0.01;

/** The cleaned mono samples, or null for a take that is silence. */
export function cleanSamples(channels: Float32Array[], sampleRate: number): Float32Array | null {
  const n = channels[0]?.length ?? 0;
  const k0 = 1 / Math.max(1, channels.length);
  const mono = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) mono[i]! += ch[i]! * k0;
  let top = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(mono[i]!);
    if (a > top) top = a;
  }
  if (top < EMPTY) return null;
  const floor = top * FLOOR;
  let start = 0;
  while (start < n && Math.abs(mono[start]!) < floor) start++;
  let end = n;
  while (end > start && Math.abs(mono[end - 1]!) < floor) end--;
  if (end <= start) return null;
  start = Math.max(0, start - Math.round(LEAD * sampleRate));
  const data = mono.slice(start, end);
  let power = 0;
  for (let i = 0; i < data.length; i++) power += data[i]! * data[i]!;
  const rms = Math.sqrt(power / data.length);
  const k = Math.min(LOUDNESS / Math.max(rms, 1e-6), PEAK / top);
  const fade = Math.min(data.length, Math.round(TAIL_FADE * sampleRate));
  for (let i = 0; i < data.length; i++) {
    const left = data.length - i;
    data[i]! *= k * (left < fade ? left / fade : 1);
  }
  return data;
}
