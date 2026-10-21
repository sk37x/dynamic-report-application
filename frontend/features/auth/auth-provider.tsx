'use client';

import {
  createContext, useContext, useEffect, useRef, useState, type ReactNode,
} from 'react';
import { appConfig } from '../../config/app.config';
import { ApiError, getErrorMessage } from '../../lib/api/api-error';
import { apiSession } from '../../lib/api/api-session';
import { apiSessionSync } from '../../lib/api/api-session-sync';
import { authService } from './auth.service';
import type { AuthSession, LoginInput } from './auth.types';

type AuthContextValue = {
  session: AuthSession;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  retrySession: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession>(() =>
    appConfig.auth.enabled
      ? { status: 'loading', user: null }
      : { status: 'disabled', user: null },
  );
  const [attempt, setAttempt] = useState(0);
  const version = useRef(0);

  useEffect(() => {
    if (!appConfig.auth.enabled) return;
    const unsubscribe = apiSession.subscribeExpired(() => {
      version.current += 1;
      setSession({ status: 'unauthenticated', user: null });
    });
    const unsubscribeChanged = apiSessionSync.subscribeChanged(() => {
      // Re-fetch /me rather than trusting user identity from a browser message.
      version.current += 1;
      setSession({ status: 'loading', user: null });
      setAttempt((value) => value + 1);
    });
    return () => {
      version.current += 1;
      unsubscribe();
      unsubscribeChanged();
    };
  }, []);

  useEffect(() => {
    if (!appConfig.auth.enabled) return;
    const controller = new AbortController();
    const requestVersion = ++version.current;

    async function loadSession() {
      try {
        const user = await authService.me(controller.signal);
        if (controller.signal.aborted || requestVersion !== version.current) return;
        setSession({ status: 'authenticated', user });
      } catch (error) {
        if (controller.signal.aborted || requestVersion !== version.current) return;
        if (error instanceof ApiError && error.status === 401) {
          setSession({ status: 'unauthenticated', user: null });
          return;
        }
        setSession({ status: 'error', user: null, message: getErrorMessage(error) });
      }
    }
    void loadSession();
    return () => controller.abort();
  }, [attempt]);

  function retrySession() {
    if (!appConfig.auth.enabled) return;
    version.current += 1;
    setSession({ status: 'loading', user: null });
    setAttempt((value) => value + 1);
  }

  function handleActionError(error: unknown, requestVersion: number) {
    if (requestVersion !== version.current) return;
    // A failed action must not leave an invalidated bootstrap stuck in loading.
    // Preserve an already authenticated/unauthenticated state.
    setSession((current) => current.status === 'loading'
      ? { status: 'error', user: null, message: getErrorMessage(error) }
      : current);
  }

  async function login(input: LoginInput) {
    if (!appConfig.auth.enabled) throw new Error('Authentication is disabled.');
    const requestVersion = ++version.current;
    try {
      const user = await authService.login(input);
      if (requestVersion !== version.current) return;
      setSession({ status: 'authenticated', user });
    } catch (error) {
      handleActionError(error, requestVersion);
      throw error;
    }
  }

  async function logout() {
    if (!appConfig.auth.enabled) return;
    const requestVersion = ++version.current;
    try {
      await authService.logout();
      if (requestVersion !== version.current) return;
      setSession({ status: 'unauthenticated', user: null });
    } catch (error) {
      handleActionError(error, requestVersion);
      throw error;
    }
  }

  return (
    <AuthContext.Provider value={{ session, login, logout, retrySession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider.');
  return context;
}
