import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MssqlDatabase } from './mssql.database';

const mocks = vi.hoisted(() => ({
    poolCreated: vi.fn(),
    connect: vi.fn(),
    close: vi.fn(),
    begin: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    rollbackListener: undefined as (() => void) | undefined,
}));

vi.mock('mssql', () => ({
    default: {
        ConnectionPool: class {
            constructor() {
                mocks.poolCreated();
            }

            on() {
                return this;
            }


            connect = mocks.connect;
            close = mocks.close;
        },

        Transaction: class {
            on(event: string, listener: () => void) {
                if(event === 'rollback') {
                    mocks.rollbackListener = listener;
                }

                return this;
            }

            begin = mocks.begin;
            commit = mocks.commit;
            rollback = mocks.rollback;
        },
    },
}));

function createDatabase() {
    return new MssqlDatabase({
        connections: [
            {
                name: 'MAIN',
                server: 'test-server',
                database: 'test-db',
                user: 'test-user',
                password: 'test-password',
            },
        ],
    });
}

beforeEach(() => {
    mocks.poolCreated.mockReset();
    mocks.connect.mockReset().mockResolvedValue(undefined);
    mocks.close.mockReset().mockResolvedValue(undefined);
    mocks.begin.mockReset().mockResolvedValue(undefined);
    mocks.commit.mockReset().mockResolvedValue(undefined);
    mocks.rollback.mockReset().mockResolvedValue(undefined);
    mocks.rollbackListener = undefined;
});

describe('MssqlDatabase', () => {
    it('ไม่ได้เลือก connection แล้วไมสร้าง pool', async () => {
        const database = new MssqlDatabase({ connections: [] });

        await database.onModuleInit();
        await database.onApplicationShutdown();

        expect(mocks.poolCreated).not.toHaveBeenCalled();
    });

    it('transaction สำเร็จแล้ว commit และปิด pool ตอน shutdown', async () => {
        const database = createDatabase();
        await database.onModuleInit();

        const result = await database.transaction(
            "MAIN",
            () => Promise.resolve('saved'),
        );

        expect(result).toBe('saved');
        expect(mocks.begin).toHaveBeenCalledTimes(1);
        expect(mocks.commit).toHaveBeenCalledTimes(1);
        expect(mocks.rollback).not.toHaveBeenCalled();

        await database.onApplicationShutdown();

        expect(mocks.close).toHaveBeenCalledTimes(1);
    });

    it('งานล้มเหลวแล้ว rollback และส่ง error เดิม', async () => {
        const database = createDatabase();
        await database.onModuleInit();

        const failure = new Error("Query failed");

        await expect(database.transaction("MAIN", () => Promise.reject(failure))).rejects.toBe(failure);

        expect(mocks.commit).not.toHaveBeenCalled();
        expect(mocks.rollback).toHaveBeenCalledTimes(1);

        await database.onApplicationShutdown();
    });

    it('ไม่ rollback ซ้ำเมื่อ driver แจ้งว่า rollback ไปแล้ว', async () => {
        const database = createDatabase();
        await database.onModuleInit();

        const failure = new Error('Transaction aborted');

        await expect(
            database.transaction('MAIN', () => {
                mocks.rollbackListener?.();
                return Promise.reject(failure);
            }),
        ).rejects.toBe(failure);

        expect(mocks.commit).not.toHaveBeenCalled();
        expect(mocks.rollback).not.toHaveBeenCalled();

        await database.onApplicationShutdown();
    });

    it('connect ล้มเหลวแล้ว cleanup pool ที่สร้างไว้', async () => {
        const failure = new Error('Database unvailable');
        mocks.connect.mockRejectedValueOnce(failure);

        const database = createDatabase();

        await expect(database.onModuleInit()).rejects.toBe(failure);

        expect(mocks.close).toHaveBeenCalledTimes(1);
    });
});