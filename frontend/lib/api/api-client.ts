import { appConfig } from '../../config/app.config';
import { ApiError } from './api-error';
import { apiFetch, type ApiFetchOptions } from './api-fetch';
import { apiSession, waitWithSignal } from './api-session';
import { apiSessionSync } from './api-session-sync';

export type ApiRequestOptions = ApiFetchOptions & {
  /** Default: appConfig.auth.enabled. Set false for public endpoints. */
  auth?: boolean;
  /** Default: true for GET, false for writes. Retry at most once after refresh. */
  retryAfterRefresh?: boolean;
};

const authEndpoints = new Set(['/auth/login', '/auth/refresh', '/auth/logout']);

async function refreshCookies(): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    // Called while holding the shared cookie lock. Another tab may already
    // have refreshed. Probe the access cookie before rotating again.
    if (apiSessionSync.enabled) {
      try {
        await apiFetch<unknown>('/auth/me', { signal: controller.signal });
        return;
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
      }
    }
    await apiFetch<unknown>('/auth/refresh', {
      method: 'POST', signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiError('การต่ออายุ session ใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง', 0);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  if (typeof window === 'undefined') {
    throw new Error('apiRequest is browser-only. Use a separate server API client.');
  }
  const pathname = path.split(/[?#]/)[0].replace(/\/+$/, '').toLowerCase();
  const auth = options.auth ?? appConfig.auth.enabled;
  if (!auth || authEndpoints.has(pathname)) return apiFetch<T>(path, options);

  const { signal, method = 'GET' } = options;
  signal?.throwIfAborted();
  // Bootstrap/rechecks should observe cookies after any pending auth change.
  // Raw /me probes above deliberately bypass this barrier (no nested locks).
  if (pathname === '/auth/me' && apiSessionSync.enabled) {
    await waitWithSignal(apiSessionSync.withLock(async () => undefined), signal);
    signal?.throwIfAborted();
  }
  const mayRetry = options.retryAfterRefresh ?? method === 'GET';
  const snapshot = apiSession.snapshot();

  function assertCurrent(): void {
    signal?.throwIfAborted();
    apiSession.assertCurrent(snapshot);
  }

  // Snapshot mutable JSON input/headers so any retry replays the same content.
  assertCurrent();
  const encodedBody = options.body === undefined ? undefined : JSON.stringify(options.body);
  const requestOptions: ApiFetchOptions = {
    ...options,
    headers: new Headers(options.headers),
    body: encodedBody === undefined ? undefined : JSON.parse(encodedBody),
  };

  async function send(): Promise<T> {
    assertCurrent();
    const result = await apiFetch<T>(path, requestOptions);
    assertCurrent();
    return result;
  }

  try {
    return await send();
  } catch (error) {
    assertCurrent();
    if (!(error instanceof ApiError) || error.status !== 401 || !mayRetry) throw error;
  }

  await waitWithSignal(apiSession.recover(snapshot, refreshCookies), signal);
  assertCurrent();

  // Deliberately not recursive: a second 401 never starts another refresh.
  try {
    return await send();
  } catch (error) {
    assertCurrent();
    if (error instanceof ApiError && error.status === 401) apiSession.expire(snapshot);
    throw error;
  }
}
