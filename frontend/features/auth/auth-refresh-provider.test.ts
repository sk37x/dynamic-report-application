import { createElement, type PropsWithChildren } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api/api-error';
import { apiSession } from '../../lib/api/api-session';
import { AuthProvider, useAuth } from './auth-provider';

const mocks = vi.hoisted(() => ({ me: vi.fn(), login: vi.fn(), logout: vi.fn() }));
vi.mock('./auth.service', () => ({ authService: mocks }));
vi.mock('../../config/app.config', () => ({ appConfig: { auth: { enabled: true } } }));
vi.mock('../../config/auth-client.config', () => ({
  authClientConfig: { crossTab: { enabled: true, scope: 'provider-test', lockWaitMs: 30_000 } },
}));

const user = {
  id: 'user-1', username: 'tester', displayName: 'Tester', roles: [], permissions: [],
};
const wrapper = ({ children }: PropsWithChildren) => createElement(AuthProvider, null, children);

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

describe('AuthProvider refresh lifecycle', () => {
  beforeEach(() => {
    mocks.me.mockReset().mockResolvedValue(user);
    mocks.login.mockReset();
    mocks.logout.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => cleanup());

  it('becomes unauthenticated when the API reports an expired session', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.session.status).toBe('authenticated'));
    act(() => apiSession.expire(apiSession.snapshot()));
    expect(result.current.session).toEqual({ status: 'unauthenticated', user: null });
  });

  it('preserves authenticated state when logout fails', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.session.status).toBe('authenticated'));
    mocks.logout.mockRejectedValueOnce(new ApiError('Temporary failure', 500));
    await act(async () => {
      await expect(result.current.logout()).rejects.toMatchObject({ status: 500 });
    });
    expect(result.current.session).toEqual({ status: 'authenticated', user });
  });

  it('a late bootstrap result cannot restore the user after logout', async () => {
    const bootstrap = deferred<typeof user>();
    mocks.me.mockReturnValueOnce(bootstrap.promise);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => { await result.current.logout(); });
    await act(async () => { bootstrap.resolve(user); await bootstrap.promise; });
    expect(result.current.session.status).toBe('unauthenticated');
  });

  it('a late login result cannot override a later logout action', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.session.status).toBe('authenticated'));
    const login = deferred<typeof user>();
    mocks.login.mockReturnValueOnce(login.promise);
    let pending!: Promise<void>;
    act(() => { pending = result.current.login({ username: 'tester', password: 'test' }); });
    await act(async () => { await result.current.logout(); });
    await act(async () => { login.resolve(user); await pending; });
    expect(result.current.session.status).toBe('unauthenticated');
  });

  it('shows a retryable bootstrap error for refresh infrastructure failures', async () => {
    mocks.me.mockRejectedValueOnce(new ApiError('Temporary failure', 500));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.session.status).toBe('error'));
    act(() => result.current.retrySession());
    await waitFor(() => expect(result.current.session.status).toBe('authenticated'));
  });

  it('rechecks the user after another tab changes authentication', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.session.status).toBe('authenticated'));
    const nextUser = { ...user, id: 'user-2', displayName: 'Changed account' };
    mocks.me.mockResolvedValueOnce(nextUser);
    const key = 'provider-test:revision';
    act(() => {
      localStorage.setItem(key, crypto.randomUUID());
      window.dispatchEvent(new StorageEvent('storage', { key }));
    });
    await waitFor(() => expect(result.current.session).toEqual({ status: 'authenticated', user: nextUser }));
  });

  it('uses the server response to determine logout in another tab', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.session.status).toBe('authenticated'));
    mocks.me.mockRejectedValueOnce(new ApiError('Session expired', 401));
    const key = 'provider-test:revision';
    act(() => {
      localStorage.setItem(key, crypto.randomUUID());
      window.dispatchEvent(new StorageEvent('storage', { key }));
    });
    await waitFor(() => expect(result.current.session.status).toBe('unauthenticated'));
  });
});
