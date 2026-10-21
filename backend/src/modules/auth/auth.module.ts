import { randomBytes } from 'node:crypto';

import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import { ConfigModule, ConfigService } from '@nestjs/config';

import type { AuthConfig } from '../../config/auth.config';

import { DatabaseModule } from '../../infrastructure/database/database.module';
import { MssqlDatabase } from '../../infrastructure/database/mssql/mssql.database';

import type {
  CredentialVerifier,
  SessionIssuer,
} from './application/auth.ports';

import { LoginUseCase } from './application/login.use-case';
import { PasswordCredentialVerifier } from './application/password-credential.verifier';

import { AuthSessionModule } from './auth-session.module';

import {
  AUTH_IDENTITY_READER,
  CREDENTIAL_VERIFIER,
  SESSION_ISSUER,
} from './auth.tokens';

import { MssqlUserIdentityReader } from './infrastructure/mssql-user-identity.render';
import { ScryptPasswordHasher } from './infrastructure/scrypt-password.hasher';

import { AuthController } from './presentation/auth.controller';
import { AuthCookies } from './presentation/auth-cookies.service';
import { AuthOriginGuard } from './presentation/auth-origin.guard';

import { AUTH_HTTP_OPTIONS } from './presentation/auth-http.options';
import type { AuthHttpOptions } from './presentation/auth-http.options';

import {
  AuthenticateSessionUseCase,
} from './application/authenticate-session.use-case';

import type {
  AuthIdentityReader,
} from './application/user-identity.ports';

import {
  TokenSessionService,
} from './infrastructure/token-session.service';

import {
  AuthMeController,
} from './presentation/auth-me.controller';

import {
  AuthSessionGuard,
} from './presentation/auth-session.guard';

import type { Provider } from '@nestjs/common';

import { OracleDatabase } from '../../infrastructure/database/oracle/oracle.database';
import { OracleUserIdentityReader } from './infrastructure/oracle-user-identity.reader';

import type {
  PasswordAccountReader,
} from './application/user-identity.ports';

import { AUTH_USER_READER } from './auth.tokens';

import { LogoutUseCase } from './application/logout.use-case';
import { AuthLogoutController } from './presentation/auth-logout.controller';

import { RefreshSessionUseCase } from './application/refresh-session.use-case';
import { AuthRefreshController } from './presentation/auth-refresh.controller';

@Module({})
export class AuthModule {
  static register(options: AuthConfig): DynamicModule {
    if (!options.enabled) {
      return {
        module: AuthModule,
      };
    }

    const { kind, connectionName } = options.credentials;

    if (
      (kind !== 'mssql' && kind !== 'oracle')
      || !/^[A-Z][A-Z0-9_]*$/.test(connectionName)
    ) {
      throw new Error('Invalid auth credentials configuration');
    }

    const userReaderProvider: Provider = kind === 'oracle'
      ? {
        provide: AUTH_USER_READER,
        inject: [OracleDatabase],

        useFactory: (database: OracleDatabase) => {
          return new OracleUserIdentityReader(
            database,
            connectionName,
          );
        },
      }
      : {
        provide: AUTH_USER_READER,
        inject: [MssqlDatabase],

        useFactory: (database: MssqlDatabase) => {
          return new MssqlUserIdentityReader(
            database,
            connectionName,
          );
        },
      };

    return {
      module: AuthModule,

      imports: [
        ConfigModule,
        DatabaseModule,

        AuthSessionModule.register({
          enabled: true,
          store: options.sessionStore,
        }),
      ],

      controllers: [
        AuthController,
        AuthMeController,
        AuthLogoutController,
        AuthRefreshController,

      ],

      providers: [
        ScryptPasswordHasher,

        {
          provide: MssqlUserIdentityReader,
          inject: [MssqlDatabase],

          useFactory: (database: MssqlDatabase) => {
            return new MssqlUserIdentityReader(
              database,
              connectionName,
            );
          },
        },

        userReaderProvider,

        {
          provide: AUTH_IDENTITY_READER,
          useExisting: AUTH_USER_READER,
        },

        {
          provide: CREDENTIAL_VERIFIER,

          inject: [
            AUTH_USER_READER,
            ScryptPasswordHasher,
          ],

          useFactory: async (
            reader: PasswordAccountReader,
            passwords: ScryptPasswordHasher,
          ): Promise<CredentialVerifier> => {
            const dummyPasswordHash = await passwords.hash(
              randomBytes(32).toString('hex'),
            );

            return new PasswordCredentialVerifier(
              reader,
              passwords,
              dummyPasswordHash,
            );
          },
        },

        {
          provide: LoginUseCase,

          inject: [
            CREDENTIAL_VERIFIER,
            SESSION_ISSUER,
          ],

          useFactory: (
            verifier: CredentialVerifier,
            issuer: SessionIssuer,
          ) => {
            return new LoginUseCase(verifier, issuer);
          },
        },

        {
          provide: AUTH_HTTP_OPTIONS,
          inject: [ConfigService],

          useFactory: (config: ConfigService): AuthHttpOptions => {
            const allowedOrigin = config.getOrThrow<string>(
              'CORS_ORIGIN',
            );

            const url = new URL(allowedOrigin);

            if (
              !['http:', 'https:'].includes(url.protocol)
              || url.origin !== allowedOrigin
            ) {
              throw new Error(
                'CORS_ORIGIN must be an exact HTTP(S) origin without a trailing slash',
              );
            }

            return {
              allowedOrigin,
              secureCookies:
                config.get<string>('NODE_ENV') === 'production',
            };
          },
        },

        {
          provide: AuthenticateSessionUseCase,

          inject: [
            TokenSessionService,
            AUTH_IDENTITY_READER,
          ],

          useFactory: (
            tokens: TokenSessionService,
            identities: AuthIdentityReader,
          ) => {
            return new AuthenticateSessionUseCase(
              tokens,
              identities,
            );
          },
        },

        {
          provide: LogoutUseCase,
          inject: [TokenSessionService],
          useFactory: (sessions: TokenSessionService) =>
            new LogoutUseCase(sessions),
        },

        {
          provide: RefreshSessionUseCase,
          inject: [
            TokenSessionService,
            AUTH_IDENTITY_READER,
          ],
          useFactory: (
            sessions: TokenSessionService,
            identities: AuthIdentityReader,
          ) => new RefreshSessionUseCase(sessions, identities),
        },

        AuthSessionGuard,
        AuthCookies,
        AuthOriginGuard,
      ],
    };
  }
}