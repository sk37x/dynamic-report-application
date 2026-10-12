import { 
    ForbiddenException,
    Inject,
    Injectable,
} from '@nestjs/common';

import type { 
    CanActivate,
    ExecutionContext
} from '@nestjs/common';

import type { Request } from 'express';

import { AUTH_HTTP_OPTIONS } from './auth-http.options';
import type { AuthHttpOptions } from './auth-http.options';

@Injectable()
export class AuthOriginGuard implements CanActivate {
    constructor(
        @Inject(AUTH_HTTP_OPTIONS)
        private readonly options: AuthHttpOptions,
    ) {}

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>();

        const origin = request.get('origin');

        if(origin !== this.options.allowedOrigin) {
            throw new ForbiddenException('Request origin is not allowed');
        }

        return true;
    }
}