import { 
    Body,
    Controller,
    Header,
    HttpCode,
    Inject,
    Post,
    Res,
    UnauthorizedException,
    UseGuards,
    ValidationPipe,
} from '@nestjs/common';

import type { Response } from 'express';
import { LoginUseCase } from '../application/login.use-case';
import { InvalidCredentialsError } from '../domain/invalid-credentials.error';

import type { AuthUser } from '../domain/auth-user';

import { AuthCookies } from './auth-cookies.service';
import { AuthOriginGuard } from './auth-origin.guard';
import { LoginDto } from './login.dto';

@Controller('auth')
export class AuthController { 
    constructor(
        @Inject(LoginUseCase)
        private readonly loginUseCase: LoginUseCase,

        @Inject(AuthCookies)
        private readonly cookies: AuthCookies,
    ) {}

    @Post('login')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    @UseGuards(AuthOriginGuard)
    async login(
        @Body(
            new ValidationPipe({
                expectedType: LoginDto,
                transform: true,
                whitelist: true,
                forbidNonWhitelisted: true,
                validationError: {
                    target: false,
                    value: false,
                },
            }),
        )
        input: LoginDto,

        @Res({ passthrough: true })
        response: Response,
    ): Promise<AuthUser> {
        try {
            const result = await this.loginUseCase.execute(input);

            this.cookies.set(response, result.session);
            
            return result.user;
        } catch(error) {
            if(error instanceof InvalidCredentialsError) {
                throw new UnauthorizedException('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
            };

            throw error;
        }
        
    }
}