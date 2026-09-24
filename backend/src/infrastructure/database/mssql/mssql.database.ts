import {
    Logger,
    type OnApplicationShutdown,
    type OnModuleInit,
} from '@nestjs/common';
import sql from 'mssql';
import type { MssqlModuleOptions } from './mssql.types';

export class MssqlDatabase implements OnModuleInit, OnApplicationShutdown {
    private readonly logger = new Logger(MssqlDatabase.name);
    private readonly pools = new Map<string, sql.ConnectionPool>();

    constructor(private readonly options: MssqlModuleOptions) { };

    async onModuleInit(): Promise<void> {
        this.validateOptions();

        try {
            for (const connection of this.options.connections) {
                const pool = new sql.ConnectionPool({
                    server: connection.server,
                    port: connection.port ?? 1433,
                    database: connection.database,
                    user: connection.user,
                    password: connection.password,

                    connectionTimeout: 15_000,
                    requestTimeout: 30_000,

                    pool: {
                        min: connection.poolMin ?? 0,
                        max: connection.poolMax ?? 5,
                        idleTimeoutMillis: 30_000,
                    },

                    options: {
                        encrypt: connection.encrypt ?? true,
                        trustServerCertificate:
                            connection.trustServerCertificate ?? false,
                        abortTransactionOnError: true,
                    },
                });

                pool.on('error', () => {
                    this.logger.error(
                        `SQL Server pool error: ${connection.name}`,
                    );
                });

                // เก็บก่อน connect เพื่อให้ cleanup ได้หาก connect ล้มเหลว
                this.pools.set(connection.name, pool);

                await pool.connect();

                this.logger.log(`SQL Server pool ready: ${connection.name}`);
            }
        } catch (error) {
            await this.closePools()
            throw error;
        }
    }

    async withRequest<T>(
        name: string,
        work: (request: sql.Request) => Promise<T>,
    ): Promise<T> {
        return work(this.getPool(name).request());
    }

    async transaction<T>(
        name: string,
        work: (createRequest: () => sql.Request) => Promise<T>,
    ): Promise<T> {
        const transaction = new sql.Transaction(this.getPool(name));
        let rolledBack = false;

        transaction.on('rollback', () => {
            rolledBack = true;
        })

        await transaction.begin();

        try {
            // ทุก request ที่สร้างตรงนี้ใช้ transaction เดียวกัน
            const result = await work(() => transaction.request());

            if (rolledBack) {
                throw new Error(`SQL Server transaction was rolled back.`);
            }

            await transaction.commit();

            return result;
        } catch (error) {
            if (!rolledBack) {
                try {
                    await transaction.rollback();
                } catch {
                    this.logger.error(`Failed to rollback SQL Server transaction: ${name}`);
                }
            }

            throw error;
        }
    }

    async onApplicationShutdown(): Promise<void> {
        await this.closePools();
    }

    private getPool(name: string): sql.ConnectionPool {
        const pool = this.pools.get(name);

        if (!pool) {
            throw new Error(`SQL Server connection is not registered: ${name}`);
        }

        return pool;
    }

    private validateOptions(): void {
        const names = new Set<string>();

        for (const connection of this.options.connections) {
            if (!/^[A-Z][A-Z0-9_]*$/.test(connection.name)) {
                throw new Error(`Invalid SQL Server name: ${connection.name}`);
            }

            if (names.has(connection.name)) {
                throw new Error(
                    `Dupplicate SQL Server connection: ${connection.name}`,
                );
            }

            names.add(connection.name);

            if (
                !connection.server?.trim() ||
                !connection.database?.trim() ||
                !connection.user?.trim() ||
                !connection.password.trim()
            ) {
                throw new Error(`Missing SQL Server configuration: ${connection.name}`);
            }

            const port = connection.port ?? 1433;
            const min = connection.poolMin ?? 0;
            const max = connection.poolMax ?? 5;

            if (!Number.isInteger(port) || port < 1 || port > 65535) {
                throw new Error(`Invalid SQL Server port: ${connection.name}`);
            }

            if (
                !Number.isInteger(min) ||
                !Number.isInteger(max) ||
                min < 0 ||
                max < 1 ||
                max < min
            ) {
                throw new Error(`Invalid SQL Server pool size: ${connection.name}`);
            }
        }
    }

    private async closePools(): Promise<void> {
        const entries = [...this.pools.entries()];
        this.pools.clear();

        for (const [name, pool] of entries) {
            try {
                await pool.close();
                this.logger.log(`SQL Server pool closed: ${name}`);
            } catch {
                this.logger.error(`Failed to close SQL Server pool: ${name}`);
            }
        };
    }
}