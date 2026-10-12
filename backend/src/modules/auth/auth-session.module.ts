import { Module, type DynamicModule } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'

import type { AuthSessionConfig } from '../../config/auth-session.config';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { MssqlDatabase } from '../../infrastructure/database/mssql/mssql.database';

import type { SessionStore } from './application/session.store';
import { SESSION_ISSUER, SESSION_STORE } from './auth.tokens';
import { MssqlSessionStore } from './infrastructure/mssql-session.store';
import { TokenSessionService } from "./infrastructure/token-session.service";

@Module({})
export class AuthSessionModule {
    static register(options: AuthSessionConfig): DynamicModule {
        if(!options.enabled) {
            return { 
                module: AuthSessionModule,
            };
        }

        const { kind, connectionName } = options.store;

        if(kind !== 'mssql') {
            throw new Error('Unsupported auth session store');
        }

        if(!/^[A-Z][A-Z0-9_]*$/.test(connectionName)) {
            throw new Error('Invalid auth session connection name');
        };

        return { 
            module: AuthSessionModule,
            
            imports: [
                ConfigModule,
                DatabaseModule,
            ],

            providers: [
                {
                    provide: SESSION_STORE,
                    inject: [MssqlDatabase],

                    useFactory: (database: MssqlDatabase): SessionStore => {
                        return new MssqlSessionStore(
                            database,
                            connectionName,
                        );
                    },
                },

                {
                    provide: TokenSessionService,
                    inject: [SESSION_STORE, ConfigService],
                    
                    useFactory: (
                        store: SessionStore,
                        config: ConfigService,
                    ): TokenSessionService => {
                        return new TokenSessionService(store, {
                            secretHex: config.getOrThrow<string>("AUTH_JWT_SECRET_HEX"),

                            issuer: config.get<string>('AUTH_JWT_ISSUER') ?? 'template-api',

                            audience: config.get<string>('AUTH_JWT_AUDIENCE') ?? 'template-web',

                            accessTtlSeconds: Number(config.get<string | number>('AUTH_ACCESS_TTL_SECONDS') ?? 900),

                            sessionTtlSeconds: Number(config.get<string | number>('AUTH_SESSION_TTL_SECONDS') ?? 604800),
                        });
                    },
                },

                {
                    provide: SESSION_ISSUER,
                    useExisting: TokenSessionService,
                }
            ],

            exports: [
                SESSION_STORE,
                SESSION_ISSUER,
                TokenSessionService,
            ]
        }
    }
}