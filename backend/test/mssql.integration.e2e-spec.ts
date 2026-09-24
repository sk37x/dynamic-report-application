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
                                    allowUnknow: true,
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
})