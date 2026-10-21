import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { input, password } from '@inquirer/prompts';
import oracledb from 'oracledb';

import { OracleDatabase } from '../src/infrastructure/database/oracle/oracle.database';
import { ScryptPasswordHasher } from '../src/modules/auth/infrastructure/scrypt-password.hasher';

function requiredEnv(name: string): string {
    const value = process.env[name];

    if (value == undefined || value.length === 0) {
        throw new Error(`Missing environment variable: ${name}`);
    }

    return value;
}

function normalizeUsername(value: string): string {
    return value.trim().toLowerCase();
}

async function main(): Promise<void> {
    // โหลด .env ก่อน เพื่อให้สามารถใช้ process.env ได้
    loadEnvFile('.env');

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error('Please run this command in an interactive terminal (TTY) to create a user.');
    }

    const connectionName = process.argv[2] ?? "MAIN";

    if (!/^[A-Z][A-Z0-9_]*$/.test(connectionName)) {
        throw new Error("Invalid Oracle connection name.");
    }

    const prefix = `ORACLE_${connectionName}`;
    const databaseUser = requiredEnv(`${prefix}_USER`);
    const databasePassword = requiredEnv(`${prefix}_PASSWORD`);
    const connectString = requiredEnv(`${prefix}_CONNECT_STRING`);

    console.log(`Oracle connection: ${connectionName}`);
    console.log(`Database user: ${databaseUser}`);
    console.log(`Connect string: ${connectString}`);
    console.log('สร้างบัญชีใหม่ใน AUTH_USERS ของ connection นี้');

    const username = normalizeUsername(
        await input({
            message: 'Username:',
            validate: (value) =>
                /^[a-z0-9._@+-]{1,100}$/.test(
                    normalizeUsername(value)
                ) || 'ใช้ a-z, 0-9, . _ @ + - จำนวน 1-100 ตัวอักษรเท่านั้น',
        }),
    );

    const displayName = (
        await input({
            message: 'Display name:',
            validate: (value) => {
                const name = value.trim();

                return (
                    (name.length > 0 && name.length <= 200) ||
                    'กรุณากรอกชื่อแสดงผล 1-200 ตัวอักษร'
                );
            },
        })
    ).trim();

    const plainPassword = await password({
        message: 'Password:',
        mask: '*',
        validate: (value) => (
            [...value].length >= 8 &&
            Buffer.byteLength(value, 'utf-8') <= 1024
        ) || 'ใช้รหัสผ่านอย่างน้อย 8 ตัวอักษร และไม่เกิน 1024 ไบต์ (UTF-8)',
    })

    await password({
        message: "Confirm password:",
        mask: '*',
        validate: (value) =>
            value === plainPassword || 'รหัสผ่านไม่ตรงกัน',
    })

    // ใช้ hasher เดียวกันกกับระบบ login และไม่ trim รหัสผ่าน
    const hasher = new ScryptPasswordHasher();
    const passwordHash = await hasher.hash(plainPassword);
    const userId = randomUUID();

    const database = new OracleDatabase({
        clientLibDir: process.env.ORACLE_CLIENT_LIB_DIR,
        connections: [
            {
                name: connectionName,
                user: databaseUser,
                password: databasePassword,
                connectString: connectString,
                poolMin: 1,
                poolMax: 1,
            }
        ]
    })

    try {
        await database.onModuleInit();

        await database.transaction(
            connectionName,
            async (connection) => {
                await connection.execute(
                    `INSERT INTO AUTH_USERS (USER_ID, USERNAME, DISPLAY_NAME, PASSWORD_HASH, IS_ACTIVE)
                     VALUES (:userId, :username, :displayName, :passwordHash, 1)`,
                    {
                        userId,
                        username,
                        displayName: {
                            val: displayName,
                            type: oracledb.DB_TYPE_NVARCHAR,
                        },
                        passwordHash,
                    },
                    {
                        autoCommit: true,
                    }
                );
            }
        )

        console.log('\nสร้างบัญชีสำเร็จ');
        console.log(`User ID: ${userId}`);
        console.log(`Username: ${username}`);
        console.log(`Display name: ${displayName}`);
    } finally {
        await database.onApplicationShutdown();
    }
}

void main().catch((error: unknown) => {
    if(error instanceof Error && error.name === 'ExitPromptError') {
        console.log('\nยกเลิกการสร้างบัญชี');
        process.exitCode = 130;
        return;
    }

    if(typeof error === 'object' && error !== null && 'errorNum' in error && error.errorNum === 1) {
        console.error('สร้างบัญชีไม่สำเร็จ: ชื่อผู้ใช้ซ้ำ');
    } else {
        console.error(error instanceof Error ? error.message : 'สร้างบัญชีไม่สำเร็จ: เกิดข้อผิดพลาดไม่ทราบสาเหตุ');
    }

    process.exitCode = 1;
})