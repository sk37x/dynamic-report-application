import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { databaseConfig } from '../../config/database.config';
import { OracleModule } from './oracle/oracle.module';
import { MssqlModule } from './mssql/mssql.module';

function readBoolean(
    config: ConfigService,
    key: string,
    fallback: boolean,
): boolean {
    const value = config.get<unknown>(key);

    if (value === undefined) {
        return fallback;
    }

    if (value === true || value === "true") {
        return true;
    }

    if (value === false || value === 'false') {
        return false;
    }

    throw new Error(`${key} must be true or false`);
}

@Module({
    imports: [
        OracleModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                clientLibDir: config.get<string>('ORACLE_CLIENT_LIB_DIR'),

                connections: databaseConfig.oracle.map((name) => {
                    const prefix = `ORACLE_${name}`;

                    return {
                        name,
                        user: config.getOrThrow<string>(`${prefix}_USER`),
                        password: config.getOrThrow<string>(`${prefix}_PASSWORD`),
                        connectString: config.getOrThrow<string>(
                            `${prefix}_CONNECT_STRING`,
                        ),
                    };
                }),
            }),
        }),

        MssqlModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],

            useFactory: (config: ConfigService) => ({
                connections: databaseConfig.mssql.map((name) => {
                    const prefix = `MSSQL_${name}`;

                    return {
                        name,
                        server: config.getOrThrow<string>(`${prefix}_SERVER`),
                        port: Number(config.get<string>(`${prefix}_PORT`) ?? '1433'),
                        database: config.getOrThrow<string>(`${prefix}_DATABASE`),
                        user: config.getOrThrow<string>(`${prefix}_USER`),
                        password: config.getOrThrow<string>(`${prefix}_PASSWORD`),

                        encrypt: readBoolean(
                            config,
                            `${prefix}_ENCRYPT`,
                            true,
                        ),

                        trustServerCertificate: readBoolean(
                            config,
                            `${prefix}_TRUST_SERVER_CERTIFICATE`,
                            false
                        ),
                    };
                }),
            }),
        }),
    ],
})

export class DatabaseModule { }