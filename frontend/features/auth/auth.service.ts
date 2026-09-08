import { apiRequest } from "@/lib/api";
import type { AuthUser, LoginInput } from "./auth.types";

export const authService = {
    me(signal?: AbortSignal) {
        return apiRequest<AuthUser>("/auth/me", { signal });
    },
    
    login(input: LoginInput) {
        return apiRequest<AuthUser>("/auth/login", {
            method: "POST",
            body: input,
        });
    },

    logout() {
        return apiRequest<void>("/auth/logout", {
            method: "POST",
        });
    }
}