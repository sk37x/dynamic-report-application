"use client";

import {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { appConfig } from "../../config/app.config";
import { ApiError, getErrorMessage } from "../../lib/api/api-error";
import { authService } from "./auth.service";
import type { AuthSession, LoginInput } from "./auth.types";

type AuthContextValue = {
    session: AuthSession;
    login: (input: LoginInput) => Promise<void>;
    logout: () => Promise<void>;
    retrySession: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(
    undefined,
);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<AuthSession>(() =>
        appConfig.auth.enabled
            ? { status: 'loading', user: null }
            : { status: 'disabled', user: null }
    );

    const [attempt, setAttemp] = useState(0);
    const version = useRef(0);

    useEffect(() => {
        if (!appConfig.auth.enabled) {
            return
        }

        const controller = new AbortController();
        const requestVersion = ++version.current;

        async function loadSession() {
            try {
                const user = await authService.me(controller.signal);

                if (controller.signal.aborted || requestVersion !== version.current) {
                    return;
                }

                setSession({ status: 'authenticated', user });
            } catch (error) {
                if (controller.signal.aborted || requestVersion !== version.current) {
                    return;
                }

                if (error instanceof ApiError && error.status === 401) {
                    setSession({ status: 'unauthenticated', user: null });
                    return;
                }

                setSession({
                    status: 'error',
                    user: null,
                    message: getErrorMessage(error),
                })
            }
        }

        void loadSession();

        return () => controller.abort();
    }, [attempt])

    function retrySession() {
        if(!appConfig.auth.enabled) {
            return;
        }

        version.current += 1;
        setSession({ status: 'loading', user: null })
        setAttemp((value) => value + 1);
    }

    async function login(input: LoginInput) {
        if(!appConfig.auth.enabled) {
            throw new Error('Authentication is disabled.');
        }

        const user = await authService.login(input);

        version.current += 1;
        setSession({ status: 'authenticated', user });
    }

    async function logout() {
        if(!appConfig.auth.enabled) {
            return;
        }

        await authService.logout();

        version.current += 1;
        setSession({ status: 'unauthenticated', user: null });
    }

    return (
        <AuthContext.Provider
            value={{ session, login, logout, retrySession }}
        >
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext);

    if(!context) {
        throw new Error("useAuth must be used with in AuthProvider.");
    }

    return context;
}