import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

vi.mock('../../config/auth-client.config', () => ({
  authClientConfig: { crossTab: { enabled: true, scope: 'cross-tab-test', lockWaitMs: 30_000 } },
}));

// Each import gets independent module state, like a separate tab, while the
// simulated browser lock/storage/backend cookie state remains shared.
async function newTab() {
  vi.resetModules();
  const { apiRequest } = await import('./api-client');
  const { apiSession } = await import('./api-session');
  const { apiSessionSync } = await import('./api-session-sync');
  return { request: apiRequest, session: apiSession, sync: apiSessionSync };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

function json(status: number, value: unknown = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

class TestLocks {
  private tail: Promise<void> = Promise.resolve();
  request<T>(_name: string, options: { signal?: AbortSignal }, work: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const signal = options.signal;
      const abort = () => reject(signal?.reason);
      signal?.addEventListener('abort', abort, { once: true });
      const job = this.tail.then(async () => {
        signal?.throwIfAborted();
        signal?.removeEventListener('abort', abort);
        return work();
      });
      this.tail = job.then(() => undefined, () => undefined);
      job.then(resolve, reject).finally(() => signal?.removeEventListener('abort', abort));
      if (signal?.aborted) abort();
    });
  }
}

describe('Cross-tab cookie coordination', () => {
  const originalFetch = globalThis.fetch;
  const locksDescriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
  let calls: string[];
  const cleanups: Array<() => void> = [];

  function mockFetch(handler: (url: string) => Response | Promise<Response>) {
    globalThis.fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      return handler(url);
    };
  }

  beforeEach(() => {
    localStorage.clear();
    calls = [];
    Object.defineProperty(navigator, 'locks', { configurable: true, value: new TestLocks() });
  });
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
    globalThis.fetch = originalFetch;
    if (locksDescriptor) Object.defineProperty(navigator, 'locks', locksDescriptor);
    else Reflect.deleteProperty(navigator, 'locks');
    vi.restoreAllMocks();
  });

  it('two tabs refresh once; the second tab probes /me and reuses the new cookies', async () => {
    const a = await newTab();
    const b = await newTab();
    let accessValid = false;
    let rotations = 0;
    const started = deferred<void>();
    const release = deferred<void>();
    mockFetch(async (url) => {
      if (url.endsWith('/auth/refresh')) {
        rotations += 1;
        started.resolve();
        await release.promise;
        accessValid = true;
        return json(200);
      }
      return accessValid ? json(200, { user: 'current' }) : json(401);
    });
    const results = Promise.all([
      a.request('/a', { auth: true }), b.request('/b', { auth: true }),
    ]);
    await started.promise;
    release.resolve();
    await results;
    assert.equal(rotations, 1);
    assert.equal(calls.filter((url) => url.endsWith('/auth/me')).length, 2);
  });

  it('a delayed 401 after another tab refreshes does not rotate again', async () => {
    const a = await newTab();
    const b = await newTab();
    let accessValid = false;
    let slowReads = 0;
    const late = deferred<Response>();
    mockFetch((url) => {
      if (url.endsWith('/slow') && ++slowReads === 1) return late.promise;
      if (url.endsWith('/auth/refresh')) { accessValid = true; return json(200); }
      return json(accessValid ? 200 : 401);
    });
    const pending = a.request('/slow', { auth: true });
    await b.request('/fast', { auth: true });
    late.resolve(json(401));
    await pending;
    assert.equal(calls.filter((url) => url.endsWith('/auth/refresh')).length, 1);
  });

  for (const status of [200, 401]) {
    it(`a stale ${status} from before another tab logs in is discarded`, async () => {
      const a = await newTab();
      const b = await newTab();
      const late = deferred<Response>();
      mockFetch((url) => url.endsWith('/auth/login') ? json(200) : late.promise);
      const stale = assert.rejects(a.request('/old-user-data', { auth: true }), { name: 'AbortError' });
      await b.session.change(() => b.request('/auth/login', { method: 'POST', auth: false }));
      late.resolve(json(status, { oldUser: true }));
      await stale;
      assert.equal(calls.length, 2);
      const revision = localStorage.getItem('cross-tab-test:revision');
      assert.match(revision ?? '', /^[0-9a-f-]{36}$/);
    });
  }

  it('logout in a second tab waits until the first tab finishes refresh', async () => {
    const a = await newTab();
    const b = await newTab();
    const started = deferred<void>();
    const release = deferred<void>();
    let accessValid = false;
    const order: string[] = [];
    mockFetch(async (url) => {
      if (url.endsWith('/auth/refresh')) {
        order.push('refresh'); started.resolve(); await release.promise;
        accessValid = true; return json(200);
      }
      if (url.endsWith('/auth/logout')) {
        order.push('logout'); accessValid = false;
        return new Response(null, { status: 204 });
      }
      return json(accessValid ? 200 : 401);
    });
    // The old request may finish before logout starts or be discarded after
    // the revision changes. It must never refresh after logout.
    const pending = a.request('/data', { auth: true }).catch((error: unknown) => {
      assert.ok(error instanceof DOMException && error.name === 'AbortError');
    });
    await started.promise;
    const logout = b.session.change(() => b.request('/auth/logout', { method: 'POST', auth: false }));
    assert.deepEqual(order, ['refresh']);
    release.resolve();
    await Promise.all([pending, logout]);
    assert.deepEqual(order, ['refresh', 'logout']);
    assert.equal(accessValid, false);
  });

  it('/me bootstrap waits for an in-flight auth change in another tab', async () => {
    const a = await newTab();
    const b = await newTab();
    const started = deferred<void>();
    const release = deferred<void>();
    let username = 'old';
    mockFetch(async (url) => {
      if (url.endsWith('/auth/login')) {
        started.resolve(); await release.promise; username = 'new';
      }
      return json(200, { username });
    });
    const login = b.session.change(() => b.request('/auth/login', { method: 'POST', auth: false }));
    await started.promise;
    const me = a.request('/auth/me', { auth: true });
    assert.equal(calls.filter((url) => url.endsWith('/auth/me')).length, 0);
    release.resolve();
    await login;
    assert.deepEqual(await me, { username: 'new' });
  });

  it('probe 500 does not rotate tokens or expire the session', async () => {
    const a = await newTab();
    let expired = 0;
    cleanups.push(a.session.subscribeExpired(() => { expired += 1; }));
    mockFetch((url) => json(url.endsWith('/auth/me') ? 500 : 401));
    await assert.rejects(a.request('/data', { auth: true }), { status: 500 });
    assert.equal(expired, 0);
    assert.equal(calls.filter((url) => url.endsWith('/auth/refresh')).length, 0);
  });

  it('unsupported Web Locks raises a coordination error without starting refresh', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    const a = await newTab();
    mockFetch(() => json(401));
    await assert.rejects(a.request('/data', { auth: true }), { status: 0 });
    assert.equal(calls.length, 1);
  });

  it('storage events request a recheck and unsubscribe removes the listener', async () => {
    const a = await newTab();
    let changed = 0;
    const stop = a.sync.subscribeChanged(() => { changed += 1; });
    cleanups.push(stop);
    const key = 'cross-tab-test:revision';
    localStorage.setItem(key, 'remote-revision-1');
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: 'remote-revision-1' }));
    assert.equal(changed, 1);
    stop();
    localStorage.setItem(key, 'remote-revision-2');
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: 'remote-revision-2' }));
    assert.equal(changed, 1);
  });

  it('storage write failure prevents login/logout before cookie-changing HTTP work', async () => {
    const a = await newTab();
    const prototype = Object.getPrototypeOf(localStorage) as Storage;
    const original = prototype.setItem;
    let started = false;
    prototype.setItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
    try {
      await assert.rejects(a.session.change(async () => { started = true; }), { status: 0 });
      assert.equal(started, false);
    } finally {
      prototype.setItem = original;
    }
  });
});
