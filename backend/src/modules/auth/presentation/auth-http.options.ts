export const AUTH_HTTP_OPTIONS = Symbol('AUTH_HTTP_OPTIONS');

export type AuthHttpOptions = {
    allowedOrigin: string;
    secureCookies: boolean;
};

export const AUTH_COOKIE_NAMES = {
    access: 'template_access_token',
    refresh: 'template_refresh_token',
} as const;