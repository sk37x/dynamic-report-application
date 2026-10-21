import {
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import type {
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';

import type { Response } from 'express';

import {
  AuthenticateSessionUseCase,
} from '../application/authenticate-session.use-case';

import { InvalidSessionError } from '../domain/invalid-session.error';

import { AUTH_COOKIE_NAMES } from './auth-http.options';

import type {
  AuthenticatedRequest,
} from './authenticated-request';

@Injectable()
export class AuthSessionGuard implements CanActivate {
  constructor(
    @Inject(AuthenticateSessionUseCase)
    private readonly authenticateSession: AuthenticateSessionUseCase,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const http = context.switchToHttp();

    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();

    response.setHeader('Cache-Control', 'no-store');

    const accessToken: unknown =
      request.cookies?.[AUTH_COOKIE_NAMES.access];

    if (
      typeof accessToken !== 'string'
      || accessToken.length === 0
    ) {
      throw new UnauthorizedException('กรุณาเข้าสู่ระบบ');
    }

    try {
      request.auth = await this.authenticateSession.execute(
        accessToken,
      );

      return true;
    } catch (error) {
      if (error instanceof InvalidSessionError) {
        throw new UnauthorizedException(
          'Session ไม่ถูกต้องหรือหมดอายุแล้ว',
        );
      }

      throw error;
    }
  }
}