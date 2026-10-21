import { randomUUID } from 'node:crypto';

import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';

import oracledb from 'oracledb';

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';

import { OracleModule } from '../src/infrastructure/database/oracle/oracle.module';
import { OracleDatabase } from '../src/infrastructure/database/oracle/oracle.database';

import type {
  AuthSessionRecord,
} from '../src/modules/auth/application/session.store';

import { PasswordCredentialVerifier } from '../src/modules/auth/application/password-credential.verifier';

import { OracleSessionStore } from '../src/modules/auth/infrastructure/oracle-session.store';
import { OracleUserIdentityReader } from '../src/modules/auth/infrastructure/oracle-user-identity.reader';
import { ScryptPasswordHasher } from '../src/modules/auth/infrastructure/scrypt-password.hasher';

describe.skipIf(process.env.RUN_ORACLE_INTEGRATION !== '1')(
  'Oracle auth integration',
  () => {
    let moduleRef: TestingModule | undefined;
    let database: OracleDatabase;

    const createdIds: string[] = [];

    function newId(): string {
      const id = randomUUID();
      createdIds.push(id);
      return id;
    }

    beforeAll(async () => {
      moduleRef = await Test.createTestingModule({
        imports: [
          OracleModule.registerAsync({
            imports: [
              ConfigModule.forRoot({
                envFilePath: '.env.integration.local',
              }),
            ],

            inject: [ConfigService],

            useFactory: (config: ConfigService) => ({
              clientLibDir: config.get<string>(
                'ORACLE_CLIENT_LIB_DIR',
              ),

              connections: [
                {
                  name: 'TEST',

                  user: config.getOrThrow<string>(
                    'ORACLE_TEST_USER',
                  ),

                  password: config.getOrThrow<string>(
                    'ORACLE_TEST_PASSWORD',
                  ),

                  connectString: config.getOrThrow<string>(
                    'ORACLE_TEST_CONNECT_STRING',
                  ),

                  poolMin: 1,
                  poolMax: 2,
                },
              ],
            }),
          }),
        ],
      }).compile();

      await moduleRef.init();

      database = moduleRef.get(OracleDatabase);
    }, 60_000);

    afterEach(async () => {
      if (createdIds.length === 0) {
        return;
      }

      await database.withConnection('TEST', async (connection) => {
        for (const id of createdIds) {
          await connection.execute(
            'DELETE FROM AUTH_SESSIONS WHERE SESSION_ID = :id',
            { id },
            { autoCommit: true },
          );

          await connection.execute(
            'DELETE FROM AUTH_USERS WHERE USER_ID = :id',
            { id },
            { autoCommit: true },
          );
        }
      });

      createdIds.length = 0;
    });

    afterAll(async () => {
      await moduleRef?.close();
    }, 60_000);

    it('เก็บ session, rotate พร้อมกัน และปฏิเสธ session ที่ใช้ไม่ได้', async () => {
      const store = new OracleSessionStore(database, 'TEST');

      const now = new Date('2030-01-01T00:00:00.000Z');

      const session: AuthSessionRecord = {
        id: newId(),
        userId: 'integration-user',
        refreshTokenHash: '11'.repeat(32),
        expiresAt: new Date(now.getTime() + 3_600_000),
        revokedAt: null,
      };

      await store.create(session);

      const anotherStore = new OracleSessionStore(database, 'TEST');

      await expect(
        anotherStore.findById(session.id),
      ).resolves.toEqual(session);

      await expect(
        store.create(session),
      ).rejects.toThrow();

      const hashA = '22'.repeat(32);
      const hashB = '33'.repeat(32);

      const results = await Promise.all([
        store.rotateRefreshToken(
          session.id,
          session.refreshTokenHash,
          hashA,
          now,
        ),

        anotherStore.rotateRefreshToken(
          session.id,
          session.refreshTokenHash,
          hashB,
          now,
        ),
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);

      const currentHash = results[0] ? hashA : hashB;

      await expect(
        store.findById(session.id),
      ).resolves.toMatchObject({
        refreshTokenHash: currentHash,
        expiresAt: session.expiresAt,
      });

      await expect(
        store.rotateRefreshToken(
          session.id,
          session.refreshTokenHash,
          '44'.repeat(32),
          now,
        ),
      ).resolves.toBe(false);

      await store.revoke(session.id, now);

      await store.revoke(
        session.id,
        new Date(now.getTime() + 1_000),
      );

      await expect(
        store.findById(session.id),
      ).resolves.toMatchObject({
        revokedAt: now,
      });

      await expect(
        store.rotateRefreshToken(
          session.id,
          currentHash,
          '55'.repeat(32),
          now,
        ),
      ).resolves.toBe(false);

      const expired: AuthSessionRecord = {
        ...session,
        id: newId(),
        expiresAt: now,
      };

      await store.create(expired);

      await expect(
        store.rotateRefreshToken(
          expired.id,
          expired.refreshTokenHash,
          hashA,
          now,
        ),
      ).resolves.toBe(false);

      await expect(
        store.findById(randomUUID()),
      ).resolves.toBeNull();
    }, 30_000);

    it('อ่านบัญชีภาษาไทย ตรวจ password และปฏิเสธบัญชีที่ปิดใช้งาน', async () => {
      const id = newId();
      const username = `test_${id.replaceAll('-', '')}`;
      const password = '  Oracle test password ภาษาไทย  ';

      const passwords = new ScryptPasswordHasher();
      const passwordHash = await passwords.hash(password);

      const reader = new OracleUserIdentityReader(database, 'TEST');

      const verifier = new PasswordCredentialVerifier(
        reader,
        passwords,
        await passwords.hash(randomUUID()),
      );

      await database.withConnection('TEST', async (connection) => {
        await connection.execute(
          `
            INSERT INTO AUTH_USERS (
              USER_ID,
              USERNAME,
              DISPLAY_NAME,
              PASSWORD_HASH,
              IS_ACTIVE
            )
            VALUES (
              :id,
              :username,
              :displayName,
              :passwordHash,
              1
            )
          `,
          {
            id,
            username,

            displayName: {
              val: "ผู้ใช้ Oracle O'Brien",
              type: oracledb.DB_TYPE_NVARCHAR,
            },

            passwordHash,
          },
          {
            autoCommit: true,
          },
        );
      });

      const identity = await verifier.verify({
        username: `  ${username.toUpperCase()}  `,
        password,
      });

      expect(identity).toEqual({
        id,
        username,
        displayName: "ผู้ใช้ Oracle O'Brien",
        isActive: true,
        roles: [],
        permissions: [],
      });

      expect(identity).not.toHaveProperty('passwordHash');

      await expect(
        reader.findById(id),
      ).resolves.toEqual(identity);

      await expect(
        verifier.verify({
          username,
          password: password.trim(),
        }),
      ).resolves.toBeNull();

      await database.withConnection('TEST', async (connection) => {
        await connection.execute(
          'UPDATE AUTH_USERS SET IS_ACTIVE = 0 WHERE USER_ID = :id',
          { id },
          { autoCommit: true },
        );
      });

      await expect(
        verifier.verify({ username, password }),
      ).resolves.toBeNull();

      await expect(
        reader.findById(id),
      ).resolves.toMatchObject({
        id,
        isActive: false,
      });
    }, 30_000);
  },
);