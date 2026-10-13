import { cleanSamples } from './cleanTake';

/* Cleans recorded takes off the main thread (`SampleBank`); one message per take, answered with its id. */
self.onmessage = (e: MessageEvent<{ id: number; channels: Float32Array[]; sampleRate: number }>) => {
  const { id, channels, sampleRate } = e.data;
  const data = cleanSamples(channels, sampleRate);
  self.postMessage({ id, data }, data ? { transfer: [data.buffer as ArrayBuffer] } : undefined);
};
