import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OracleDatabase } from './oracle.database';
import type { OracleConnectionOptions } from './oracle.types';

const driver = vi.hoisted(() => ({
    initOracleClient: vi.fn(),
    createPool: vi.fn()
}));

vi.mock('oracledb', () => ({
    default: driver,
}));

const main: OracleConnectionOptions = {
    name: 'MAIN',
    user: 'test-user',
    password: 'test-password',
    connectString: 'test-host/test-service',
};

function createPoolMock() {
    const connection = {
        callTimeout: 0,
        commit: vi.fn().mockResolvedValue(undefined),
        rollback: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
    };

    const pool = {
        getConnection: vi.fn().mockResolvedValue(connection),
        close: vi.fn().mockResolvedValue(undefined),
    }

    return { connection, pool };
}

beforeEach(() => {
    driver.initOracleClient.mockReset();
    driver.createPool.mockReset();
});

describe('OracleDatabase', () => {
    it('ไม่มี connection config แล้วไม่โหลด Client หรือสร้าง pool', async () => {
        const database = new OracleDatabase({connections: [],});

        await database.onModuleInit();
        await database.onApplicationShutdown();

        expect(driver.initOracleClient).not.toHaveBeenCalled();
        expect(driver.createPool).not.toHaveBeenCalled();
    });

    it('transaction สำเร็จแล้ว commit และคืน connection', async () => {
        const { connection, pool } = createPoolMock();
        driver.createPool.mockResolvedValueOnce(pool);

        const database = new OracleDatabase({connections: [main]});

        await database.onModuleInit();

        const result = await database.transaction('MAIN', () => Promise.resolve('saved'));

        expect(result).toBe('saved');
        expect(connection.commit).toHaveBeenCalledTimes(1);
        expect(connection.rollback).not.toHaveBeenCalled();
        expect(connection.close).toHaveBeenCalledTimes(1);

        expect(
            connection.commit.mock.invocationCallOrder[0],
        ).toBeLessThan(
            connection.close.mock.invocationCallOrder[0],
        );

        await database.onApplicationShutdown();

        expect(pool.close).toHaveBeenCalledWith(10);
    });

    it('transaction ล้มเหลวแล้ว roolback คืน connection และส่ง error เดิม', async () => {
        const { connection, pool } = createPoolMock();
        driver.createPool.mockResolvedValueOnce(pool);

        const database = new OracleDatabase({
            connections: [main],
        });

        await database.onModuleInit();

        const failure = new Error(`Insert failed`);

        await expect(
            database.transaction(
                'MAIN',
                () => Promise.reject(failure),
            ),
        ).rejects.toBe(failure);

        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.close).toHaveBeenCalledTimes(1);

        expect(
            connection.rollback.mock.invocationCallOrder[0],
        ).toBeLessThan(
            connection.close.mock.invocationCallOrder[0],
        );
        await database.onApplicationShutdown();
    });

    it(`เปิด pool ตัวที่สองไม่สำเร็จ ต้องปิดตัวแรกที่เปิดไปแล้ว`, async () => {
        const { pool } = createPoolMock();
        const failure = new Error('AUTH database unavailable');

        driver.createPool
            .mockResolvedValueOnce(pool)
            .mockRejectedValueOnce(failure);

        const database = new OracleDatabase({
            connections: [
                main,
                {
                    ...main,
                    name: 'AUTH',
                },
            ],
        });

        await expect(database.onModuleInit()).rejects.toBe(failure);

        expect(pool.close).toHaveBeenCalledWith(10);
    });
});