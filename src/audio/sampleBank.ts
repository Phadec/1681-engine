/**
 * The recorded takes of the sounds, registered by the game (`registerTakes`): `<sound>.mp3`, and `<sound>_2.mp3`…
 * when a sound has more than one. A
 * sound with takes plays one of them at random, never the same one twice running when it has more; a sound without
 * any — or whose takes have not decoded yet — falls back to its synth recipe in `SoundEngine`.
 *
 * Every take is cleaned once on decode (`cleanTake.ts`: mono, silence trimmed, one loudness), off the main thread
 * in `takeCleanerWorker.ts`, so `sounds.json`'s `fileGain` is the only mix knob. Measured on the first batch, peaks
 * alone left their loudness 20 dB apart.
 */

import { cleanSamples } from './cleanTake';

const TAKES: Record<string, string[]> = {};

/**
 * Registers recorded takes by file path → url, e.g. a Vite `import.meta.glob('./sfx/*.mp3', { query: '?url',
 * import: 'default', eager: true })`. `hit.mp3`, `hit_2.mp3`… are takes of `hit`; sound names carry no digits.
 */
export function registerTakes(urls: Record<string, string>): void {
  for (const [path, url] of Object.entries(urls)) {
    const m = /(?:^|\/)([a-z_]+?)(?:_\d+)?\.mp3$/.exec(path);
    if (m) (TAKES[m[1]!] ??= []).push(url);
  }
}

/** The sound has recorded takes in the build (decoded or not). */
export const hasTakes = (name: string): boolean => !!TAKES[name];

export class SampleBank {
  private readonly decoded = new Map<string, AudioBuffer[]>();
  private readonly loading = new Set<string>();
  private readonly last = new Map<string, number>();

  names(): string[] {
    return Object.keys(TAKES);
  }

  /** A decoded take, or null while none is ready (the caller then synthesises); starts loading on first ask. */
  take(ctx: AudioContext, name: string): AudioBuffer | null {
    const list = this.decoded.get(name);
    if (!list?.length) {
      this.load(ctx, name);
      return null;
    }
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === this.last.get(name)) i = (i + 1) % list.length;
    this.last.set(name, i);
    return list[i]!;
  }

  load(ctx: AudioContext, name: string): void {
    const urlsOf = TAKES[name];
    if (!urlsOf || this.loading.has(name)) return;
    this.loading.add(name);
    const list: AudioBuffer[] = [];
    this.decoded.set(name, list);
    for (const url of urlsOf) {
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .then((buf) => clean(buf))
        .then((data) => {
          if (!data) return;
          const out = ctx.createBuffer(1, data.length, ctx.sampleRate);
          out.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
          list.push(out);
        })
        .catch(() => {});
    }
  }
}

let worker: Worker | null | undefined;
let nextId = 0;
const waiting = new Map<number, (data: Float32Array | null) => void>();

/** The cleaner worker, started on first use; null where workers cannot start (then takes are cleaned here). */
function cleaner(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./takeCleanerWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; data: Float32Array | null }>) => {
      waiting.get(e.data.id)?.(e.data.data);
      waiting.delete(e.data.id);
    };
    worker.onerror = () => {
      worker?.terminate();
      worker = null;
      for (const done of waiting.values()) done(null);
      waiting.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

/** Takes handed over one per task: a fight's first blows ask for a dozen at once, and copying them all out in one
 *  task still froze a frame. */
let turn: Promise<void> = Promise.resolve();

/** A decoded take cleaned at the context's own rate (decodeAudioData resamples to it). */
function clean(buf: AudioBuffer): Promise<Float32Array | null> {
  return new Promise((resolve) => {
    turn = turn
      .then(() => new Promise<void>((r) => setTimeout(r, 0)))
      .then(() => {
        send(buf).then(resolve, () => resolve(null));
      });
  });
}

function send(buf: AudioBuffer): Promise<Float32Array | null> {
  const channels = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c).slice());
  const w = cleaner();
  if (!w) return Promise.resolve(cleanSamples(channels, buf.sampleRate));
  const id = nextId++;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    w.postMessage({ id, channels, sampleRate: buf.sampleRate }, { transfer: channels.map((c) => c.buffer as ArrayBuffer) });
  });
}
