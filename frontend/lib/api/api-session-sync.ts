import { authClientConfig } from '../../config/auth-client.config';
import { ApiError } from './api-error';

const settings = authClientConfig.crossTab;
const storageKey = `${settings.scope}:revision`;
const lockName = `${settings.scope}:cookies`;

function storage(): Storage {
  try {
    return window.localStorage;
  } catch {
    throw new ApiError('ไม่สามารถประสาน session ระหว่างแท็บได้: browser ไม่อนุญาต localStorage', 0);
  }
}

function revision(): string {
    if(!settings.enabled) return '';
    try {
        return storage().getItem(storageKey) ?? '';
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError('ไม่สามารถอ่านสถานะ session ระหว่างแท็บได้', 0);
    }
}

function markChanged(): void {
    try {
        // Random revision only: no tokens, user details or permissions in storage.
        storage().setItem(storageKey, crypto.randomUUID());
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError('ไม่สามารถบันทึกสถานะ session ระหว่างแท็บได้', 0);
    }
}

async function withLock<T>(work: () => Promise<T>): Promise<T> {
  if (!settings.enabled) return work();
  if (typeof navigator === 'undefined' || !navigator.locks?.request) {
    throw new ApiError('การประสาน session ต้องใช้ browser ที่รองรับ Web Locks ผ่าน HTTPS หรือ localhost', 0);
  }
  const waiting = new AbortController();
  const timer = setTimeout(() => waiting.abort(), settings.lockWaitMs);
  try {
    return await navigator.locks.request(lockName, { signal: waiting.signal }, async () => {
      clearTimeout(timer);
      return work();
    });
  } catch (error) {
    if (waiting.signal.aborted) {
      throw new ApiError('มีการดำเนินการเกี่ยวกับ session ในอีกแท็บนานเกินไป กรุณาลองใหม่', 0);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function change<T>(work: () => Promise<T>): Promise<T> {
  if (!settings.enabled) return work();
  return withLock(async () => {
    // Start invalidates old protected responses even before cookies change.
    markChanged();
    try {
      return await work();
    } finally {
      // Recheck even after a failed operation; do not assume login/logout succeeded.
      markChanged();
    }
  });
}

function subscribeChanged(listener: () => void): () => void {
  if (!settings.enabled || typeof window === 'undefined') return () => undefined;
  let seen: string;
  try { seen = revision(); } catch {
    // API requests surface storage errors as retryable errors, not React effect crashes.
    return () => undefined;
  }
  const check = () => {
    try {
      const current = revision();
      if (current === seen) return;
      seen = current;
    } catch {
      // Rechecking /me will expose the actual coordination error to the UI.
    }
    listener();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) check();
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') check();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('focus', check);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

export const apiSessionSync = {
  enabled: settings.enabled, revision, withLock, change, subscribeChanged,
};
