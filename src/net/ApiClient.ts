import { timeoutSignal } from '../platform/timeoutSignal';

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * A request that failed. `status` 0 with `code` `'NETWORK'` is no answer at all (offline, a timeout, a refused
 * connection), `'ABORTED'` the caller's own abort; otherwise `status` is the server's, and `code`, `message` and
 * `details` are what `describe` read off its body.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Readonly<Record<string, string>>,
    /** The parsed body of the failed answer, when there was one. */
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** What a failed answer's body says: the default reads `code`, `message` and `details` off a JSON object. */
export interface ApiErrorInfo {
  code?: string;
  message?: string;
  details?: Readonly<Record<string, string>>;
}

/**
 * What a refresh came back with: a new access token, `'refused'` (the session is over), or null (the server could not
 * be asked — keep the session and let the next call try again).
 */
export type RefreshResult = string | 'refused' | null;

export interface ApiClientOptions {
  /** The server's origin (`https://host`), or one chosen per path (accounts on one server, the game on another). */
  baseUrl: string | ((path: string) => string);
  /** Headers sent with every request (a client version, a platform), asked afresh each time. */
  headers?: () => Readonly<Record<string, string>>;
  /** Default 10 s; a request may give its own. */
  timeoutMs?: number;
  /** Turns a failed answer's parsed body into its code, message and details (a game rendering its own messages). */
  describe?: (body: unknown, status: number) => ApiErrorInfo;
  /** The message of a request that got no answer (default `'Cannot reach the server.'`). */
  networkMessage?: string | (() => string);
  /** Paths a 401 never refreshes for (the login and refresh calls themselves). */
  noRefresh?: (path: string) => boolean;
  /** Called with every failed answer before it is thrown (an "update required" gate reading `status` or `code`). */
  onError?: (error: ApiError) => void;
  /** Called for answers with one status before it is thrown: `{ 426: (e) => showUpdate(e.details) }`. */
  onStatus?: Readonly<Record<number, (error: ApiError) => void>>;
  /** Default the global `fetch`. */
  fetch?: typeof fetch;
}

export interface ApiRequestOptions {
  timeoutMs?: number;
  /** The caller's own abort; its abort throws an `ApiError` with code `'ABORTED'`. */
  signal?: AbortSignal;
  /** Headers for this request alone, over the client's. */
  headers?: Readonly<Record<string, string>>;
}

function defaultDescribe(body: unknown): ApiErrorInfo {
  if (!body || typeof body !== 'object') return {};
  const b = body as Record<string, unknown>;
  return {
    code: typeof b.code === 'string' ? b.code : undefined,
    message: typeof b.message === 'string' ? b.message : undefined,
    details: b.details && typeof b.details === 'object' ? (b.details as Record<string, string>) : undefined,
  };
}

function anySignal(signals: readonly AbortSignal[]): AbortSignal {
  const any = (AbortSignal as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof any === 'function') return any.call(AbortSignal, [...signals]);
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    s.addEventListener('abort', () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
}

/**
 * A small JSON REST client: a bearer token, JSON in and out, a timeout on every call, and a session kept alive — a 401
 * is refreshed once (`refresher`) and the request sent again. A game keeps its endpoints and types in a subclass or
 * beside it; nothing here knows any route.
 */
export class ApiClient {
  private token: string | null = null;
  /** A new access token for a 401 (`RefreshResult`); unset, a 401 is simply thrown. */
  refresher: (() => Promise<RefreshResult>) | null = null;
  /** Called when a 401 ends the session: no refresher, a refused refresh, or a retry refused again. */
  onUnauthorized: (() => void) | null = null;

  constructor(private readonly options: ApiClientOptions) {}

  get accessToken(): string | null {
    return this.token;
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  /** Sends a request and returns its parsed JSON body (undefined for an empty or unreadable one). */
  async request<T>(method: ApiMethod, path: string, body?: unknown, options: ApiRequestOptions = {}, retried = false): Promise<T> {
    const o = this.options;
    const headers: Record<string, string> = { Accept: 'application/json', ...o.headers?.(), ...options.headers };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const sentToken = this.token;
    if (sentToken) headers.Authorization = `Bearer ${sentToken}`;
    const timeout = timeoutSignal(options.timeoutMs ?? o.timeoutMs ?? 10_000);
    const signal = options.signal ? anySignal([timeout, options.signal]) : timeout;
    let res: Response;
    let text: string;
    try {
      const base = typeof o.baseUrl === 'function' ? o.baseUrl(path) : o.baseUrl;
      res = await (o.fetch ?? fetch)(base + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal,
      });
      text = res.status === 204 ? '' : await res.text();
    } catch (err) {
      if (options.signal?.aborted) throw new ApiError(0, 'ABORTED', 'Aborted.');
      console.warn('[api] network error', method, path, err);
      throw this.networkError();
    }
    let data: unknown = undefined;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = undefined;
      }
    }
    if (res.ok) return data as T;
    const info = (o.describe ?? defaultDescribe)(data, res.status);
    const error = new ApiError(res.status, info.code ?? `HTTP_${res.status}`, info.message ?? `HTTP ${res.status}`, info.details, data);
    o.onError?.(error);
    o.onStatus?.[res.status]?.(error);
    if (res.status === 401 && this.token && !retried && !o.noRefresh?.(path)) {
      // sent before a refresh (another request's) finished: the token has changed since, so this one is simply sent
      // again with it — a second rotation would spend the refresh token the first one just received
      if (sentToken !== this.token) return this.request<T>(method, path, body, options, true);
      if (this.refresher) {
        const fresh = await this.refresher().catch(() => null);
        if (fresh !== null && fresh !== 'refused') {
          this.token = fresh;
          return this.request<T>(method, path, body, options, true);
        }
        // the refresh itself got no answer (a phone back from the background on a weak network): the session still
        // stands, so nobody is thrown to the login screen for it — the next call tries again
        if (fresh === null) throw this.networkError();
      }
    }
    if (res.status === 401 && this.token) this.onUnauthorized?.();
    throw error;
  }

  private networkError(): ApiError {
    const m = this.options.networkMessage;
    return new ApiError(0, 'NETWORK', typeof m === 'function' ? m() : (m ?? 'Cannot reach the server.'));
  }
}
