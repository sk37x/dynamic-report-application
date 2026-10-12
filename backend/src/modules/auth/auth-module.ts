import { randomBytes } from "crypto";

import { Module } from '@nestjs/common';
import type { DynamicModule } from "@nestjs/common";

import { ConfigModule, ConfigService } from "@nestjs/config";

import type { AuthConfig } from "../../config/auth.config";

import { DatabaseModule } from "../../infrastructure/database/database.module";
import { MssqlDatabase } from "../../infrastructure/database/mssql/mssql.database";

import type {
    CredentialVerifier,
    SessionIssuer,
} from './application/auth.ports';

import { LoginUseCase } from "./application/login.use-case";
import { PasswordCredentialVerifier } from "./application/password-credential.verifier";

import { AuthSessionModule } from "./auth-session.module";

import { 
    AUTH_IDENTITY_READER,
    CREDENTIAL_VERIFIER,
    SESSION_ISSUER,
} from './auth.tokens';

import { MssqlUserIdentityReader } from "./infrastructure/mssql-user-identity-render";
import { ScryptPasswordHasher } from "./infrastructure/scrypt-password.hasher";

import { AuthController } from "./presentation/auth.controller";
import { AuthCookies } from "./presentation/auth-cookies.service";
import { AuthOriginGuard } from "./presentation/auth-origin.guard";

import { AUTH_HTTP_OPTIONS } from './presentation/auth-http.options';
import type { AuthHttpOptions } from "./presentation/auth-http.options";

@Module({})
export class AuthModule { 
    static register(options: AuthConfig): DynamicModule {
        if(!options.enabled) {
            return { 
                module: AuthModule,
            };
        }

        const { kind, connectionName } = options.credentials;

        if(
            kind !== 'mssql'
            || !/^[A-Z][A-Z0-9_]*$/.test(connectionName)
        ) {
            throw new Error("Invalid auth credentials configuration");
        }

        return {
            module: AuthModule,
            imports: [
                ConfigModule,
                DatabaseModule,

                AuthSessionModule.register({
                    enabled: true,
                    store: options.sessionStore
                }),
            ],

            controllers: [AuthController]
        }
    }
}