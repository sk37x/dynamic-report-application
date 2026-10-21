import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { apiRequest } from './api-client';
import { apiSession } from './api-session';

// These 14 tests retain the original single-tab contract. Cross-tab behavior
// is exercised separately in api-cross-tab.test.ts.
vi.mock('../../config/auth-client.config', () => ({
  authClientConfig: { crossTab: { enabled: false, scope: 'single-tab-test', lockWaitMs: 30_000 } },
}));

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function json(status: number, value: unknown = {}) {
  return new Response(JSON.stringify(value), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

type Call = { url: string; options?: RequestInit };

describe('API automatic refresh', () => {
  const originalFetch = globalThis.fetch;
  let calls: Call[];
  let expired: number;
  let unsubscribe: () => void;

  function mockFetch(handler: (call: Call) => Response | Promise<Response>) {
    globalThis.fetch = async (input, options) => {
      const call = { url: String(input), options };
      calls.push(call);
      return handler(call);
    };
  }

  beforeEach(async () => {
    await apiSession.change(async () => undefined);
    calls = [];
    expired = 0;
    unsubscribe = apiSession.subscribeExpired(() => { expired += 1; });
  });

  afterEach(() => {
    unsubscribe();
    globalThis.fetch = originalFetch;
  });

  it('refreshes a GET once, includes cookies, and retries successfully', async () => {
    let reads = 0;
    mockFetch(({ url, options }) => {
      if (url.endsWith('/auth/refresh')) {
        assert.equal(options?.method, 'POST');
        assert.equal(options?.credentials, 'include');
        return json(200, { id: 'user-1' });
      }
      return ++reads === 1 ? json(401) : json(200, { value: 42 });
    });
    assert.deepEqual(await apiRequest('/data', { auth: true }), { value: 42 });
    assert.equal(calls.length, 3);
    assert.equal(expired, 0);
  });

  it('a second 401 expires the session without a refresh loop', async () => {
    mockFetch(({ url }) => json(url.endsWith('/auth/refresh') ? 200 : 401));
    await assert.rejects(apiRequest('/data', { auth: true }), { status: 401 });
    assert.equal(calls.length, 3);
    assert.equal(expired, 1);
  });

  it('refresh 401 expires the session and does not retry the original request', async () => {
    mockFetch(() => json(401));
    await assert.rejects(apiRequest('/data', { auth: true }), { status: 401 });
    assert.equal(calls.length, 2);
    assert.equal(expired, 1);
  });

  for (const status of [0, 500]) {
    it(`refresh error ${status} propagates without logging the user out`, async () => {
      mockFetch(({ url }) => {
        if (!url.endsWith('/auth/refresh')) return json(401);
        if (status === 0) throw new TypeError('network unavailable');
        return json(500, { message: 'Temporary failure' });
      });
      await assert.rejects(apiRequest('/data', { auth: true }), { status });
      assert.equal(expired, 0);
      assert.equal(calls.length, 2);
    });
  }

  it('concurrent 401 responses share one refresh', async () => {
    const started = deferred<void>();
    const release = deferred<Response>();
    const reads = new Map<string, number>();
    mockFetch(({ url }) => {
      if (url.endsWith('/auth/refresh')) {
        started.resolve();
        return release.promise;
      }
      const count = (reads.get(url) ?? 0) + 1;
      reads.set(url, count);
      return count === 1 ? json(401) : json(200, { ok: true });
    });
    const pending = Promise.all([
      apiRequest('/a', { auth: true }), apiRequest('/b', { auth: true }),
    ]);
    await started.promise;
    release.resolve(json(200));
    await pending;
    assert.equal(calls.filter((call) => call.url.endsWith('/auth/refresh')).length, 1);
    assert.equal(calls.length, 5);
  });

  it('a late 401 reuses the completed refresh instead of rotating again', async () => {
    const delayed = deferred<Response>();
    const reads = new Map<string, number>();
    mockFetch(({ url }) => {
      if (url.endsWith('/auth/refresh')) return json(200);
      const count = (reads.get(url) ?? 0) + 1;
      reads.set(url, count);
      if (count > 1) return json(200);
      return url.endsWith('/slow') ? delayed.promise : json(401);
    });
    const slow = apiRequest('/slow', { auth: true });
    await apiRequest('/fast', { auth: true });
    delayed.resolve(json(401));
    await slow;
    assert.equal(calls.filter((call) => call.url.endsWith('/auth/refresh')).length, 1);
  });

  it('aborting one waiter does not cancel refresh for another waiter', async () => {
    const started = deferred<void>();
    const release = deferred<Response>();
    const controller = new AbortController();
    const reads = new Map<string, number>();
    let refreshSignal: AbortSignal | null | undefined;
    mockFetch(({ url, options }) => {
      if (url.endsWith('/auth/refresh')) {
        refreshSignal = options?.signal;
        started.resolve();
        return release.promise;
      }
      const count = (reads.get(url) ?? 0) + 1;
      reads.set(url, count);
      return count === 1 ? json(401) : json(200);
    });
    const cancelled = assert.rejects(
      apiRequest('/a', { auth: true, signal: controller.signal }),
      { name: 'AbortError' },
    );
    const other = apiRequest('/b', { auth: true });
    await started.promise;
    controller.abort();
    await cancelled;
    assert.equal(refreshSignal?.aborted, false);
    release.resolve(json(200));
    await other;
    assert.equal(calls.filter((call) => call.url.endsWith('/a')).length, 1);
    assert.equal(expired, 0);
  });

  it('logout waits for in-flight refresh and prevents the old request from replaying', async () => {
    const started = deferred<void>();
    const release = deferred<Response>();
    const order: string[] = [];
    mockFetch(({ url }) => {
      if (url.endsWith('/auth/refresh')) {
        order.push('refresh');
        started.resolve();
        return release.promise;
      }
      if (url.endsWith('/auth/logout')) {
        order.push('logout');
        return new Response(null, { status: 204 });
      }
      return json(401);
    });
    const oldRequest = assert.rejects(apiRequest('/data', { auth: true }), { name: 'AbortError' });
    await started.promise;
    const logout = apiSession.change(() =>
      apiRequest<void>('/auth/logout', { method: 'POST', auth: false }),
    );
    assert.deepEqual(order, ['refresh']);
    release.resolve(json(200));
    await Promise.all([oldRequest, logout]);
    assert.deepEqual(order, ['refresh', 'logout']);
    assert.equal(calls.filter((call) => call.url.endsWith('/data')).length, 1);
    assert.equal(expired, 0);
  });

  it('a stale 401 from before login cannot refresh or expire the new session', async () => {
    const delayed = deferred<Response>();
    mockFetch(({ url }) => url.endsWith('/auth/login') ? json(200) : delayed.promise);
    const oldRequest = assert.rejects(apiRequest('/old', { auth: true }), { name: 'AbortError' });
    await apiSession.change(() => apiRequest('/auth/login', { method: 'POST', auth: false }));
    delayed.resolve(json(401));
    await oldRequest;
    assert.equal(calls.length, 2);
    assert.equal(expired, 0);
  });

  it('login, logout and refresh endpoints never auto-refresh themselves', async () => {
    mockFetch(() => json(401));
    for (const endpoint of ['login', 'logout', 'refresh']) {
      await assert.rejects(apiRequest(`/auth/${endpoint}`, {
        method: 'POST', auth: true, retryAfterRefresh: true,
      }), { status: 401 });
    }
    assert.equal(calls.length, 3);
    assert.equal(expired, 0);
  });

  it('public requests preserve their original 401 without auth side effects', async () => {
    mockFetch(() => json(401, { message: 'Original error' }));
    await assert.rejects(apiRequest('/public', { auth: false }), {
      status: 401, message: 'Original error',
    });
    assert.equal(calls.length, 1);
    assert.equal(expired, 0);
  });

  it('writes are not automatically replayed unless explicitly opted in', async () => {
    mockFetch(() => json(401));
    await assert.rejects(apiRequest('/save', {
      method: 'POST', auth: true, body: { value: 1 },
    }), { status: 401 });
    assert.equal(calls.length, 1);
  });

  it('an opted-in write replays the same JSON snapshot, not mutated caller input', async () => {
    const body = { value: 1 };
    let writes = 0;
    mockFetch(({ url, options }) => {
      if (url.endsWith('/auth/refresh')) {
        body.value = 999;
        return json(200);
      }
      assert.equal(options?.body, '{"value":1}');
      return ++writes === 1 ? json(401) : json(200);
    });
    await apiRequest('/save', { method: 'POST', auth: true, retryAfterRefresh: true, body });
    assert.equal(writes, 2);
  });
});
