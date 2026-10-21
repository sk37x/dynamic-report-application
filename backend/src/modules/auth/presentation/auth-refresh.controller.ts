import {
  Controller,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { RefreshSessionUseCase } from '../application/refresh-session.use-case';
import type { AuthUser } from '../domain/auth-user';
import { InvalidSessionError } from '../domain/invalid-session.error';
import { AuthCookies } from './auth-cookies.service';
import { AUTH_COOKIE_NAMES } from './auth-http.options';
import { AuthOriginGuard } from './auth-origin.guard';

@Controller('auth')
export class AuthRefreshController {
  constructor(
    @Inject(RefreshSessionUseCase)
    private readonly refreshSession: RefreshSessionUseCase,

    @Inject(AuthCookies)
    private readonly authCookies: AuthCookies,
  ) {}

  @Post('refresh')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthOriginGuard)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUser> {
    const refreshToken: unknown =
      request.cookies?.[AUTH_COOKIE_NAMES.refresh];

    if (
      typeof refreshToken !== 'string' ||
      refreshToken.length === 0
    ) {
      throw new UnauthorizedException(
        'Session ไม่ถูกต้องหรือหมดอายุแล้ว',
      );
    }

    try {
      const result =
        await this.refreshSession.execute(refreshToken);

      this.authCookies.set(response, result.session);

      return result.user;
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