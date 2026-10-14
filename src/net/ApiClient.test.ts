import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiClient, ApiError } from './ApiClient';

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(answers: (call: Call, n: number) => Response | Promise<Response>): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    return answers(call, calls.length - 1);
  }) as unknown as typeof fetch;
  return { fetch: f, calls };
}

const json = (status: number, body: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });

test('JSON in and out, with the client headers, the token and a base chosen per path', async () => {
  const { fetch, calls } = fakeFetch(() => json(200, { ok: 1 }));
  const api = new ApiClient({
    baseUrl: (p) => (p.startsWith('/auth/') ? 'https://lobby' : 'https://game'),
    headers: () => ({ 'X-Client': '1.0' }),
    fetch,
  });
  api.setToken('t1');
  assert.deepEqual(await api.request('POST', '/things', { a: 1 }), { ok: 1 });
  await api.request('GET', '/auth/me');
  assert.equal(calls[0]!.url, 'https://game/things');
  assert.equal(calls[1]!.url, 'https://lobby/auth/me');
  const h = calls[0]!.init.headers as Record<string, string>;
  assert.equal(h.Authorization, 'Bearer t1');
  assert.equal(h['X-Client'], '1.0');
  assert.equal(h['Content-Type'], 'application/json');
  assert.equal(calls[0]!.init.body, '{"a":1}');
  assert.equal((calls[1]!.init.headers as Record<string, string>)['Content-Type'], undefined);
});

test('a failed answer is an ApiError described by the game, with its status hooks called first', async () => {
  const seen: string[] = [];
  const { fetch } = fakeFetch(() => json(426, { code: 'UPDATE_REQUIRED', message: 'old {0}', args: ['1'], details: { url: 'u' } }));
  const api = new ApiClient({
    baseUrl: '',
    fetch,
    describe: (b) => ({ code: (b as { code: string }).code, message: 'rendered' }),
    onError: (e) => seen.push(`error ${e.code}`),
    onStatus: { 426: (e) => seen.push(`426 ${e.status}`) },
  });
  await assert.rejects(api.request('GET', '/x'), (e: unknown) => e instanceof ApiError && e.status === 426 && e.message === 'rendered' && e.code === 'UPDATE_REQUIRED');
  assert.deepEqual(seen, ['error UPDATE_REQUIRED', '426 426']);
  const plain = new ApiClient({ baseUrl: '', fetch: fakeFetch(() => new Response('oops', { status: 500 })).fetch });
  await assert.rejects(plain.request('GET', '/x'), (e: unknown) => e instanceof ApiError && e.code === 'HTTP_500' && e.message === 'HTTP 500');
});

test('no answer is a NETWORK error; the caller\'s abort is ABORTED', async () => {
  const api = new ApiClient({ baseUrl: '', networkMessage: () => 'offline', fetch: fakeFetch(() => Promise.reject(new TypeError('failed'))).fetch });
  const warn = console.warn;
  console.warn = () => {};
  try {
    await assert.rejects(api.request('GET', '/x'), (e: unknown) => e instanceof ApiError && e.code === 'NETWORK' && e.message === 'offline' && e.status === 0);
    const controller = new AbortController();
    const slow = new ApiClient({
      baseUrl: '',
      fetch: ((_u: string, init: RequestInit) =>
        new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch,
    });
    const p = slow.request('GET', '/x', undefined, { signal: controller.signal });
    controller.abort();
    await assert.rejects(p, (e: unknown) => e instanceof ApiError && e.code === 'ABORTED');
    const timed = slow.request('GET', '/x', undefined, { timeoutMs: 5 });
    await assert.rejects(timed, (e: unknown) => e instanceof ApiError && e.code === 'NETWORK');
  } finally {
    console.warn = warn;
  }
});

test('a 401 is refreshed once and sent again; a refused refresh ends the session', async () => {
  const { fetch, calls } = fakeFetch((c) => {
    const auth = (c.init.headers as Record<string, string>).Authorization;
    return auth === 'Bearer fresh' ? json(200, { me: 1 }) : json(401, {});
  });
  const api = new ApiClient({ baseUrl: '', fetch, noRefresh: (p) => p.startsWith('/auth/') });
  let ended = 0;
  api.onUnauthorized = () => ended++;
  api.setToken('stale');
  api.refresher = async () => 'fresh';
  assert.deepEqual(await api.request('GET', '/me'), { me: 1 });
  assert.equal(api.accessToken, 'fresh');
  assert.equal(calls.length, 2);
  api.setToken('stale');
  api.refresher = async () => 'refused';
  await assert.rejects(api.request('GET', '/me'), (e: unknown) => e instanceof ApiError && e.status === 401);
  assert.equal(ended, 1);
  // the refresh got no answer: the session stands, the call fails as a network error
  api.refresher = async () => null;
  await assert.rejects(api.request('GET', '/me'), (e: unknown) => e instanceof ApiError && e.code === 'NETWORK');
  assert.equal(ended, 1);
  // the login itself is never refreshed for
  let asked = 0;
  api.refresher = async () => {
    asked++;
    return 'fresh';
  };
  await assert.rejects(api.request('POST', '/auth/login', {}), (e: unknown) => e instanceof ApiError && e.status === 401);
  assert.equal(asked, 0);
});

test('a 401 for a token replaced meanwhile is sent again with the new one, without a second refresh', async () => {
  let api!: ApiClient;
  const { fetch } = fakeFetch((c, n) => {
    if (n === 0) {
      api.setToken('rotated');
      return json(401, {});
    }
    return (c.init.headers as Record<string, string>).Authorization === 'Bearer rotated' ? json(200, 7) : json(401, {});
  });
  api = new ApiClient({ baseUrl: '', fetch });
  api.setToken('old');
  let refreshed = 0;
  api.refresher = async () => {
    refreshed++;
    return 'x';
  };
  assert.equal(await api.request('GET', '/n'), 7);
  assert.equal(refreshed, 0);
});
