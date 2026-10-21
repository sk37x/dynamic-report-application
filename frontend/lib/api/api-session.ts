import { ApiError } from './api-error';
import { apiSessionSync } from './api-session-sync';

type SessionSnapshot = {
  epoch: number;
  tokenVersion: number;
  remoteRevision: string;
};

/** Browser-tab coordination. Contains no React or feature imports. */
class ApiSession {
  private epoch = 0;
  private tokenVersion = 0;
  private changes = 0;
  private tail: Promise<void> = Promise.resolve();
  private flight?: { epoch: number; promise: Promise<void> };
  private listeners = new Set<() => void>();

  snapshot(): SessionSnapshot {
    return {
      epoch: this.epoch, tokenVersion: this.tokenVersion,
      remoteRevision: apiSessionSync.revision(),
    };
  }

  assertCurrent(snapshot: SessionSnapshot): void {
    if (snapshot.epoch !== this.epoch || this.changes > 0 ||
      snapshot.remoteRevision !== apiSessionSync.revision()) {
      throw new DOMException('Authentication changed during request.', 'AbortError');
    }
  }

  subscribeExpired(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  expire(snapshot: SessionSnapshot): void {
    this.assertCurrent(snapshot);
    this.epoch += 1;
    for (const listener of this.listeners) listener();
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  /** All cookie-changing login/logout calls must use this method. */
  change<T>(work: () => Promise<T>): Promise<T> {
    // Immediately invalidate old requests, even while waiting for a refresh.
    this.epoch += 1;
    this.changes += 1;
    return this.enqueue(async () => {
      try {
        return await apiSessionSync.change(work);
      } finally {
        this.changes -= 1;
      }
    });
  }

  recover(snapshot: SessionSnapshot, refresh: () => Promise<unknown>): Promise<void> {
    this.assertCurrent(snapshot);

    // A late 401 may belong to a request sent before a completed refresh.
    if (snapshot.tokenVersion !== this.tokenVersion) return Promise.resolve();
    if (this.flight?.epoch === snapshot.epoch) return this.flight.promise;

    const promise = this.enqueue(() => apiSessionSync.withLock(async () => {
      this.assertCurrent(snapshot);
      try {
        await refresh();
      } catch (error) {
        this.assertCurrent(snapshot);
        if (error instanceof ApiError && error.status === 401) {
          this.expire(snapshot);
        }
        throw error;
      }
      this.assertCurrent(snapshot);
      this.tokenVersion += 1;
    }));

    this.flight = { epoch: snapshot.epoch, promise };
    const clear = () => {
      if (this.flight?.promise === promise) this.flight = undefined;
    };
    void promise.then(clear, clear);
    return promise;
  }
}

export const apiSession = new ApiSession();

/** Cancel only this caller's wait, never the shared refresh request. */
export function waitWithSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      cleanup();
      reject(signal.reason ?? new DOMException('Request aborted.', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    // Always attach rejection handlers, including when already aborted.
    promise.then(
      (value) => { cleanup(); resolve(value); },
      (error: unknown) => { cleanup(); reject(error); },
    );
    if (signal.aborted) onAbort();
  });
}
