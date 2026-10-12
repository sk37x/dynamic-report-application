import { Inject, Injectable } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';

import type { IssuedSession } from '../application/auth.ports';

import { 
    AUTH_COOKIE_NAMES,
    AUTH_HTTP_OPTIONS,
} from './auth-http.options';

import type { AuthHttpOptions } from './auth-http.options';

@Injectable()
export class AuthCookies {
    constructor(
        @Inject(AUTH_HTTP_OPTIONS)
        private readonly options: AuthHttpOptions,
    ) {}

    set(response: Response, session: IssuedSession): void {
        const common: CookieOptions = {
            httpOnly: true,
            secure: this.options.secureCookies,
            sameSite: 'lax',
            path: '/',
        };

        response.cookie(
            AUTH_COOKIE_NAMES.access,
            session.accessToken,
            {
                ...common,
                expires: session.accessTokenExpiresAt,
            },
        );

        response.cookie(
            AUTH_COOKIE_NAMES.refresh,
            session.refreshToken,
            {
                ...common,
                expires: session.refreshTokenExpiresAt,
            },
        );
    }
}