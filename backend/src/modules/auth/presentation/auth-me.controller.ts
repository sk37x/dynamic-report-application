import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import type { AuthUser } from '../domain/auth-user';

import { AuthSessionGuard } from './auth-session.guard';

import type {
  AuthenticatedRequest,
} from './authenticated-request';

@Controller('auth')
export class AuthMeController {
  @Get('me')
  @UseGuards(AuthSessionGuard)
  me(
    @Req() request: AuthenticatedRequest,
  ): AuthUser {
    if (!request.auth) {
      throw new UnauthorizedException('กรุณาเข้าสู่ระบบ');
    }

    return request.auth.user;
  }
}