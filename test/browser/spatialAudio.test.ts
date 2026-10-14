import { expect, test } from 'vitest';
import { SpatialAudio } from '../../src/audio/spatial';

const RATE = 22050;

/** A second of a steady tone, mono: loud enough to measure, low enough that the far-off muffle keeps most of it. */
function tone(ctx: BaseAudioContext, seconds = 1, hz = 220): AudioBuffer {
  const b = ctx.createBuffer(1, Math.round(RATE * seconds), RATE);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.sin((2 * Math.PI * hz * i) / RATE) * 0.5;
  return b;
}

/** RMS of each channel over [from, to) seconds. */
function loudness(buf: AudioBuffer, from: number, to: number): [number, number] {
  const out: number[] = [];
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let sum = 0;
    const a = Math.floor(from * RATE);
    const b = Math.floor(to * RATE);
    for (let i = a; i < b; i++) sum += d[i]! * d[i]!;
    out.push(Math.sqrt(sum / (b - a)));
  }
  return out as [number, number];
}

test('a source on the left is heard in the left ear, one on the right in the right', async () => {
  const ctx = new OfflineAudioContext(2, RATE, RATE);
  const audio = new SpatialAudio(ctx);
  audio.update({ x: 0, y: 0 });
  audio.emitter(tone(ctx), -150, 0, { range: 480 });
  const out = await ctx.startRendering();
  const [l, r] = loudness(out, 0.1, 0.9);
  expect(l).toBeGreaterThan(r * 2);
  const ctx2 = new OfflineAudioContext(2, RATE, RATE);
  const audio2 = new SpatialAudio(ctx2);
  audio2.emitter(tone(ctx2), 150, 0, { range: 480 });
  const [l2, r2] = loudness(await ctx2.startRendering(), 0.1, 0.9);
  expect(r2).toBeGreaterThan(l2 * 2);
});

test('a nearer source is louder; one out of range is silent and holds no voice', async () => {
  const levels: number[] = [];
  for (const d of [40, 240]) {
    const ctx = new OfflineAudioContext(2, RATE / 2, RATE);
    new SpatialAudio(ctx).emitter(tone(ctx), 0, d, { range: 480 });
    const [l, r] = loudness(await ctx.startRendering(), 0.1, 0.45);
    levels.push(l + r);
  }
  expect(levels[0]).toBeGreaterThan(levels[1]! * 1.5);
  const ctx = new OfflineAudioContext(2, RATE / 2, RATE);
  const audio = new SpatialAudio(ctx);
  const far = audio.emitter(tone(ctx), 0, 1000, { range: 480 });
  expect(far.playing).toBe(false);
  expect(audio.size).toBe(1);
  const [l, r] = loudness(await ctx.startRendering(), 0, 0.5);
  expect(l + r).toBe(0);
});

test('a listener walking up to a loop brings it in, eased rather than switched on', async () => {
  const ctx = new OfflineAudioContext(2, RATE, RATE);
  const audio = new SpatialAudio(ctx);
  audio.update({ x: 0, y: 0 });
  const hum = audio.emitter(tone(ctx, 0.25), 600, 0, { range: 480 });
  expect(hum.playing).toBe(false);
  void ctx.suspend(0.5).then(() => {
    audio.update({ x: 550, y: 0 });
    void ctx.resume();
  });
  const out = await ctx.startRendering();
  const [lA, rA] = loudness(out, 0.05, 0.45);
  const [lB, rB] = loudness(out, 0.65, 0.95);
  expect(lA + rA).toBe(0);
  expect(lB + rB).toBeGreaterThan(0.2);
  expect(hum.playing).toBe(true);
});

test('a one-shot plays once and is dropped; a stopped emitter is done and silent', async () => {
  const ctx = new OfflineAudioContext(2, RATE, RATE);
  const audio = new SpatialAudio(ctx);
  const shot = audio.play(tone(ctx, 0.2), 0, 0);
  const loop = audio.emitter(tone(ctx, 0.2), 0, 0);
  loop.stop();
  expect(loop.done).toBe(true);
  expect(loop.playing).toBe(false);
  expect(audio.size).toBe(1);
  const out = await ctx.startRendering();
  const [l, r] = loudness(out, 0.05, 0.15);
  const [lAfter, rAfter] = loudness(out, 0.4, 0.9);
  expect(l + r).toBeGreaterThan(0.1);
  expect(lAfter + rAfter).toBe(0);
  expect(shot.done).toBe(true);
  expect(audio.size).toBe(0);
  // a one-shot out of range is done at once
  expect(audio.play(tone(ctx, 0.2), 5000, 0).done).toBe(true);
});

test('the output gain is the master volume; a fade-out stop ramps down rather than cuts', async () => {
  const ctx = new OfflineAudioContext(2, RATE, RATE);
  const audio = new SpatialAudio(ctx);
  audio.output.gain.value = 0.5;
  const e = audio.emitter(tone(ctx), 0, 0);
  void ctx.suspend(0.5).then(() => {
    e.stop(200);
    void ctx.resume();
  });
  const out = await ctx.startRendering();
  const [l0, r0] = loudness(out, 0.1, 0.4);
  const [lFade, rFade] = loudness(out, 0.55, 0.65);
  const [lEnd, rEnd] = loudness(out, 0.75, 1);
  // a 0.5 sine (0.354 RMS) at half volume, through an equal-power pan at centre (× cos π/4): 0.125 an ear
  expect(Math.abs(l0 - 0.125)).toBeLessThan(0.01);
  expect(Math.abs(r0 - l0)).toBeLessThan(0.01);
  expect(lFade + rFade).toBeLessThan(l0 + r0);
  expect(lFade + rFade).toBeGreaterThan(0);
  expect(lEnd + rEnd).toBe(0);
});
