import { Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import oracledb from 'oracledb';
import type { OracleModuleOptions } from './oracle.types';

export class OracleDatabase implements OnModuleInit, OnApplicationShutdown {
    private readonly logger = new Logger(OracleDatabase.name);
    private readonly pools = new Map<string, oracledb.Pool>();

    constructor(private readonly options: OracleModuleOptions) { }

    async onModuleInit(): Promise<void> {
        // ไม่เปิด Oracle client ไม่สร้าง pool
        if (this.options.connections.length === 0) {
            return;
        }

        this.validateOptions();

        oracledb.initOracleClient(
            this.options.clientLibDir ? { libDir: this.options.clientLibDir } : {},
        );

        try {
            for (const connection of this.options.connections) {
                const pool = await oracledb.createPool({
                    user: connection.user,
                    password: connection.password,
                    connectString: connection.connectString,

                    poolMin: connection.poolMin ?? 1,
                    poolMax: connection.poolMax ?? 5,
                    poolIncrement: 1,
                    poolTimeout: 60,
                    queueTimeout: 10_000,
                });

                this.pools.set(connection.name, pool);
                this.logger.log(`Oracle pool ready: ${connection.name}`);
            }
        } catch (error) {
            // หากเปิด MAIN สำเร็จ แต่ AUTH ล้มเหลว
            // หากปิด pool ที่เปิดไแล้วด้วย
            await this.closePools();
            throw error;
        }
    }

    async withConnection<T>(
        name: string,
        work: (connection: oracledb.Connection) => Promise<T>,
    ): Promise<T> {
        const pool = this.pools.get(name);

        if (!pool) {
            throw new Error(`Oracle connection is not registered: ${name}`);
        }

        const connection = await pool.getConnection();

        try {
            connection.callTimeout = 30_000;
            return await work(connection);
        } finally {
            try {
                // ไม่ทับผลลัพธ์หรือ error ของงานหลัก
                // โดยเฉพาะกรณี transaction commit ไปแล้ว
                await connection.close();
            } catch {
                this.logger.error(`Failed to release Oracle connection: ${name}`);
            };
        }
    }

    async transaction<T>(
        name: string, 
        work: (connection: oracledb.Connection) => Promise<T>
    ): Promise<T> {
        return this.withConnection(name, async (connection) => {
            try {
                const result = await work(connection);

                await connection.commit();
                
                return result;
            } catch(error) {
                try { 
                    await connection.rollback();
                } catch {
                    this.logger.error(`Failed to rollback Oracle transaction: ${name}`);
                };
                
                throw error;
            }
        })
    }

    async onApplicationShutdown(): Promise<void> {
        await this.closePools();
    }

    private validateOptions(): void {
        const names = new Set<string>();

        for (const connection of this.options.connections) {
            if (!/^[A-Z][A-Z0-9_]/.test(connection.name)) {
                throw new Error('Oracle connection name must use uppercase letters, numbers or underscores.');
            };

            if (names.has(connection.name)) {
                throw new Error(`Dupplicate Oracle connection name: ${connection.name}`);
            };

            names.add(connection.name);

            if (
                !connection.user?.trim() ||
                !connection.password ||
                !connection.connectString?.trim()
            ) {
                throw new Error(`Missing Oracle credentials or connect string: ${connection.name}`)
            };

            const min = connection.poolMin ?? 1;
            const max = connection.poolMax ?? 5;

            if (
                !Number.isInteger(min) ||
                !Number.isInteger(max) ||
                min < 1 || max < min
            ) {
                throw new Error(`Invalid Oracle pool size: ${connection.name}`);
            }

        };

    }

    private async closePools(): Promise<void> {
        const entries = [...this.pools.entries()];

        this.pools.clear();

        for (const [name, pool] of entries) {
            try {
                await pool.close(10);
                this.logger.log(`Oracle pool closed: ${name}`);
            } catch {
                this.logger.error(`Failed to close Oracle pool: ${name}`);
            }
        }
    }

}