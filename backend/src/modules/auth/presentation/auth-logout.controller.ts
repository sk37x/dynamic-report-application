import {
  Controller,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { LogoutUseCase } from '../application/logout.use-case';
import { AuthCookies } from './auth-cookies.service';
import { AUTH_COOKIE_NAMES } from './auth-http.options';
import { AuthOriginGuard } from './auth-origin.guard';

@Controller('auth')
export class AuthLogoutController {
  constructor(
    @Inject(LogoutUseCase)
    private readonly logoutUseCase: LogoutUseCase,

    @Inject(AuthCookies)
    private readonly authCookies: AuthCookies,
  ) {}

  @Post('logout')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthOriginGuard)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const accessToken: unknown =
      request.cookies?.[AUTH_COOKIE_NAMES.access];

    const refreshToken: unknown =
      request.cookies?.[AUTH_COOKIE_NAMES.refresh];

    await this.logoutUseCase.execute({
      accessToken:
        typeof accessToken === 'string'
          ? accessToken
          : undefined,

      refreshToken:
        typeof refreshToken === 'string'
          ? refreshToken
          : undefined,
    });

    // ล้างหลังทำงานสำเร็จ ถ้า database error จะยังไม่มาถึงบรรทัดนี้
    this.authCookies.clear(response);
  }
}