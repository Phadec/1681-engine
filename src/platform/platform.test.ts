import assert from 'node:assert/strict';
import { test } from 'node:test';
import { onAppResume, type ResumeEnv } from './appResume.ts';
import { timeoutSignal } from './timeoutSignal.ts';

function fakeEnv(): { env: ResumeEnv; fire: (type: string, e?: { persisted?: boolean }) => void; state: { visibility: string; t: number; listeners: number } } {
  const listeners = new Map<string, (e: { persisted?: boolean }) => void>();
  const state = { visibility: 'visible', t: 0, listeners: 0 };
  const target = {
    addEventListener: (type: string, cb: (e: { persisted?: boolean }) => void) => {
      listeners.set(type, cb);
      state.listeners++;
    },
    removeEventListener: (type: string) => {
      listeners.delete(type);
      state.listeners--;
    },
  };
  const env: ResumeEnv = {
    document: { get visibilityState() { return state.visibility; }, ...target },
    window: target,
    now: () => state.t,
  };
  return { env, state, fire: (type, e = {}) => listeners.get(type)?.(e) };
}

test('onAppResume fires when the app is shown again, with how long it was hidden', () => {
  const { env, fire, state } = fakeEnv();
  const seen: number[] = [];
  const off = onAppResume((ms) => seen.push(ms), env);
  fire('visibilitychange'); // shown while never hidden: not a resume
  state.visibility = 'hidden';
  state.t = 1000;
  fire('visibilitychange');
  state.visibility = 'visible';
  state.t = 4500;
  fire('visibilitychange');
  fire('pageshow', { persisted: false });
  fire('pageshow', { persisted: true });
  assert.deepEqual(seen, [3500, 0]);
  off();
  assert.equal(state.listeners, 0);
});

test('onAppResume does nothing where there is no document', () => {
  const off = onAppResume(() => assert.fail('called'), {});
  off();
});

test('timeoutSignal aborts with a TimeoutError', async () => {
  const signal = timeoutSignal(5);
  assert.equal(signal.aborted, false);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(signal.aborted, true);
  assert.equal((signal.reason as Error).name, 'TimeoutError');
});

test('timeoutSignal falls back to a timer where AbortSignal.timeout is missing', async () => {
  const native = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout');
  Object.defineProperty(AbortSignal, 'timeout', { value: undefined, configurable: true });
  try {
    const signal = timeoutSignal(5);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(signal.aborted, true);
    assert.equal((signal.reason as Error).name, 'TimeoutError');
  } finally {
    if (native) Object.defineProperty(AbortSignal, 'timeout', native);
  }
});
