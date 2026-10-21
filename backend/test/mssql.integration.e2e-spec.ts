import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import Joi from 'joi';
import sql from 'mssql';
import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it
} from 'vitest';

import { MssqlModule } from '../src/infrastructure/database/mssql/mssql.module';
import { MssqlDatabase } from '../src/infrastructure/database/mssql/mssql.database';

import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach } from 'vitest';

import type {
    AuthSessionRecord,
} from '../src/modules/auth/application/session.store';
import {
    MssqlSessionStore,
} from '../src/modules/auth/infrastructure/mssql-session.store';
import { PasswordCredentialVerifier } from '../src/modules/auth/application/password-credential.verifier';
import { MssqlUserIdentityReader } from '../src/modules/auth/infrastructure/mssql-user-identity.render';
import { ScryptPasswordHasher } from '../src/modules/auth/infrastructure/scrypt-password.hasher';

const enabled = process.env.RUN_MSSQL_INTEGRATION === '1';

describe.skipIf(!enabled)('SQL Server integration', () => {
    let moduleRef: TestingModule | undefined;
    let database: MssqlDatabase;
    let expectedDatabase: string;

    beforeAll(async () => {
        moduleRef = await Test.createTestingModule({
            imports: [
                MssqlModule.registerAsync({
                    imports: [
                        ConfigModule.forRoot({
                            envFilePath: '.env.integration.local',

                            validationSchema: Joi.object({
                                MSSQL_TEST_SERVER: Joi.string().required(),

                                MSSQL_TEST_PORT: Joi.number()
                                    .integer()
                                    .min(1)
                                    .max(65535)
                                    .default(1433),

                                MSSQL_TEST_DATABASE: Joi.string().required(),
                                MSSQL_TEST_USER: Joi.string().required(),
                                MSSQL_TEST_PASSWORD: Joi.string().required(),

                                MSSQL_TEST_ENCRYPT: Joi.boolean().default(true),

                                MSSQL_TEST_TRUST_SERVER_CERTIFICATE: Joi.boolean().default(false),
                            }),

                            validationOptions: {
                                libraryOptions: {
                                    allowUnknown: true,
                                    abortEarly: false,
                                }
                            },
                        }),
                    ],

                    inject: [ConfigService],

                    useFactory: (config: ConfigService) => {
                        expectedDatabase = config.getOrThrow<string>('MSSQL_TEST_DATABASE');

                        return {
                            connections: [
                                {
                                    name: 'TEST',
                                    server: config.getOrThrow<string>('MSSQL_TEST_SERVER'),
                                    port: config.getOrThrow<number>('MSSQL_TEST_PORT'),
                                    database: expectedDatabase,
                                    user: config.getOrThrow<string>('MSSQL_TEST_USER'),
                                    password: config.getOrThrow<string>('MSSQL_TEST_PASSWORD'),
                                    encrypt: config.getOrThrow<boolean>('MSSQL_TEST_ENCRYPT'),
                                    trustServerCertificate: config.getOrThrow<boolean>(`MSSQL_TEST_TRUST_SERVER_CERTIFICATE`),


                                    poolMin: 0,
                                    poolMax: 2,
                                },
                            ]
                        }
                    }
                })
            ],
        }).compile();

        await moduleRef.init();

        database = moduleRef.get(MssqlDatabase);
    }, 60_000);

    afterAll(async () => {
        // เรียก lifecycle hook เพื่อปิด pool 
        await moduleRef?.close();
    }, 60_000);

    it('เชื่อมต่อและอ่านจาก database ที่กำหนดได้', async () => {
        const result = await database.withRequest(
            'TEST',
            (request) =>
                request.query<{
                    databaseName: string;
                    ok: number;
                }>(`SELECT DB_NAME() as databaseName, CAST(1 AS INT) AS ok`),
        );

        expect(result.recordset).toHaveLength(1);
        expect(result.recordset[0].ok).toBe(1);

        expect(result.recordset[0].databaseName).toBe(
            expectedDatabase,
        );
    }, 40_000);

    it('ส่งข้อความภาษาไทยและเครื่องหมาย quote ผ่าน bind parameter ได้', async () => {
        const value = "ทดสอบภาษาไทย O'Brien";

        const result = await database.withRequest(
            'TEST',
            (request) =>
                request
                    .input('value', sql.NVarChar(100), value)
                    .query<{ value: string }>(`SELECT @value AS value`),
        );

        expect(result.recordset[0].value).toBe(value);
    }, 40_000);

    describe('MssqlSessionStore', () => {
        let store: MssqlSessionStore;
        const createdIds: string[] = [];

        const now = new Date('2030-01-01T00:00:00.000Z');
        const originalHash = '11'.repeat(32);

        beforeEach(() => {
            store = new MssqlSessionStore(
                database,
                'TEST',
            );
        });

        afterEach(async () => {
            // const database = moduleRef.get(MssqlDatabase);

            for (const id of createdIds) {
                await database.withRequest('TEST', async (request) => {
                    await request
                        .input('id', sql.UniqueIdentifier, id)
                        .query(`
            DELETE FROM dbo.auth_sessions
            WHERE session_id = @id;
          `);
                });
            }

            createdIds.length = 0;
        });

        function makeSession(
            overrides: Partial<AuthSessionRecord> = {},
        ): AuthSessionRecord {
            const session: AuthSessionRecord = {
                id: randomUUID(),
                userId: "ผู้ใช้ทดสอบ O'Brien",
                refreshTokenHash: originalHash,
                expiresAt: new Date('2030-01-02T00:00:00.000Z'),
                revokedAt: null,
                ...overrides,
            };

            createdIds.push(session.id);

            return session;
        }

        it('บันทึกและอ่าน session ผ่าน adapter อีก instance ได้', async () => {
            const session = makeSession();

            await store.create(session);

            const anotherStore = new MssqlSessionStore(
                database,
                'TEST',
            );

            await expect(
                anotherStore.findById(session.id),
            ).resolves.toEqual(session);

            await expect(
                anotherStore.findById(randomUUID()),
            ).resolves.toBeNull();
        });

        it('ไม่เขียนทับ session เมื่อ ID ซ้ำ', async () => {
            const session = makeSession();

            await store.create(session);

            await expect(
                store.create({
                    ...session,
                    userId: 'another-user',
                }),
            ).rejects.toThrow();

            await expect(
                store.findById(session.id),
            ).resolves.toEqual(session);
        });

        it('เปลี่ยน hash พร้อมกันสำเร็จครั้งเดียว', async () => {
            const session = makeSession();
            await store.create(session);

            const nextHashA = '22'.repeat(32);
            const nextHashB = '33'.repeat(32);

            const results = await Promise.all([
                store.rotateRefreshToken(
                    session.id,
                    originalHash,
                    nextHashA,
                    now,
                ),
                store.rotateRefreshToken(
                    session.id,
                    originalHash,
                    nextHashB,
                    now,
                ),
            ]);

            expect(results.filter((value) => value === true)).toHaveLength(1);
            expect(results.filter((value) => value === false)).toHaveLength(1);

            const saved = await store.findById(session.id);
            const winningHash = results[0] ? nextHashA : nextHashB;

            expect(saved?.refreshTokenHash).toBe(winningHash);
            expect(saved?.expiresAt).toEqual(session.expiresAt);

            await expect(
                store.rotateRefreshToken(
                    session.id,
                    originalHash,
                    '44'.repeat(32),
                    now,
                ),
            ).resolves.toBe(false);
        });

        it.each([
            {
                name: 'หมดอายุแล้ว',
                overrides: {
                    expiresAt: now,
                },
            },
            {
                name: 'ถูก revoke แล้ว',
                overrides: {
                    revokedAt: now,
                },
            },
        ])('ไม่เปลี่ยน hash เมื่อ session $name', async ({ overrides }) => {
            const session = makeSession(overrides);
            await store.create(session);

            await expect(
                store.rotateRefreshToken(
                    session.id,
                    originalHash,
                    '22'.repeat(32),
                    now,
                ),
            ).resolves.toBe(false);

            const saved = await store.findById(session.id);

            expect(saved?.refreshTokenHash).toBe(originalHash);
        });

        it('revoke ซ้ำได้และคงเวลาที่ revoke ครั้งแรก', async () => {
            const session = makeSession();
            await store.create(session);

            await store.revoke(session.id, now);

            await store.revoke(
                session.id,
                new Date(now.getTime() + 1_000),
            );

            const saved = await store.findById(session.id);

            expect(saved?.revokedAt).toEqual(now);

            await expect(
                store.revoke(randomUUID(), now),
            ).resolves.toBeUndefined();
        });
    });

    it('ตรวจ credentials และอ่านข้อมูลผู้ใช้จาก SQL Server', async () => {
        const userId = randomUUID();
        const username = `test_${userId.replaceAll('-', '')}`;
        const password = '  Integration test password ภาษาไทย  ';

        const passwords = new ScryptPasswordHasher();

        const passwordHash = await passwords.hash(password);

        const dummyPasswordHash = await passwords.hash(randomUUID());

        const reader = new MssqlUserIdentityReader(database, 'TEST');

        const verifier = new PasswordCredentialVerifier(reader, passwords, dummyPasswordHash);

        try {
            await database.withRequest('TEST', async (request) => {
                await request
                    .input('id', sql.UniqueIdentifier, userId)
                    .input('username', sql.VarChar(100), username)
                    .input('displayName', sql.NVarChar(200), "ผู้ใช้ทดสอบ O'Brien")
                    .input('passwordHash', sql.VarChar(200), passwordHash)
                    .query(`
                        INSERT INTO dbo.auth_users(
                            user_id,
                            username,
                            display_name,
                            password_hash,
                            is_active
                        )     
                        VALUES (
                            @id,
                            @username,
                            @displayName,
                            @passwordHash,
                            1
                        );
                    `);
            });

            const identity = await verifier.verify({
                username: ` ${username.toUpperCase()} `,
                password,
            });

            expect(identity).toEqual({
                id: userId,
                username,
                displayName: "ผู้ใช้ทดสอบ O'Brien",
                isActive: true,
                roles: [],
                permissions: [],
            });

            expect(identity).not.toHaveProperty('passwordHash');

            await expect(reader.findById(userId)).resolves.toEqual(identity);
            await expect(verifier.verify({username, password: password.trim()})).resolves.toBeNull();
            await expect(verifier.verify({username: `missing_${randomUUID().replaceAll('-', '')}`, password})).resolves.toBeNull();

            await database.withRequest('TEST',
                async(request) => {
                    await request
                        .input('id', sql.UniqueIdentifier, userId)
                        .query(`
                            UPDATE dbo.auth_users
                            SET is_active = 0
                            WHERE user_id = @id;
                        `);
                }
            );
            await expect(verifier.verify({username, password})).resolves.toBeNull();
            await expect(reader.findById(userId)).resolves.toMatchObject({
                id: userId,
                isActive: false,
            })
        } finally {
            await database.withRequest('TEST', async (request) => {
                await request
                    .input('id', sql.UniqueIdentifier, userId)
                    .query(`
                        DELETE FROM dbo.auth_users
                        WHERE user_id = @id;
                    `)
            })
        }
    }, 30_000);

})