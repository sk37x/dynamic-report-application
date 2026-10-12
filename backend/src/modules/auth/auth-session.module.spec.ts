import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DatabaseModule } from '../../infrastructure/database/database.module';
import { MssqlDatabase } from '../../infrastructure/database/mssql/mssql.database';

import { AuthSessionModule } from './auth-session.module';
import { SESSION_ISSUER, SESSION_STORE } from './auth.tokens';
import { MssqlSessionStore } from './infrastructure/mssql-session.store';
import { TokenSessionService } from './infrastructure/token-session.service';

const databaseStub = {
  withRequest: vi.fn(),
};

@Module({
  providers: [
    {
      provide: MssqlDatabase,
      useValue: databaseStub,
    },
  ],
  exports: [MssqlDatabase],
})
class TestDatabaseModule {}

function createConfigStub(values: Record<string, string>) {
  return {
    get(key: string): string | undefined {
      return values[key];
    },

    getOrThrow(key: string): string {
      const value = values[key];

      if (value === undefined) {
        throw new Error(`Missing config: ${key}`);
      }

      return value;
    },
  };
}

function createEnabledModule(values: Record<string, string>) {
  return Test.createTestingModule({
    imports: [
      AuthSessionModule.register({
        enabled: true,
        store: {
          kind: 'mssql',
          connectionName: 'MAIN',
        },
      }),
    ],
  })
    .overrideModule(DatabaseModule)
    .useModule(TestDatabaseModule)
    .overrideProvider(ConfigService)
    .useValue(createConfigStub(values))
    .compile();
}

describe('AuthSessionModule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ปิดได้โดยไม่ต้องมี ConfigService หรือฐานข้อมูล', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AuthSessionModule.register({
          enabled: false,
        }),
      ],
    }).compile();

    try {
      await moduleRef.init();

      expect(() => moduleRef.get(SESSION_STORE)).toThrow();

      expect(() => {
        moduleRef.get(TokenSessionService);
      }).toThrow();
    } finally {
      await moduleRef.close();
    }
  });

  it('เปิดแล้วเลือก MSSQL และใช้ issuer instance เดิม', async () => {
    const moduleRef = await createEnabledModule({
      AUTH_JWT_SECRET_HEX: 'ab'.repeat(32),
    });

    try {
      await moduleRef.init();

      expect(moduleRef.get(SESSION_STORE)).toBeInstanceOf(
        MssqlSessionStore,
      );

      const service = moduleRef.get(TokenSessionService);

      expect(service).toBeInstanceOf(TokenSessionService);

      expect(moduleRef.get(SESSION_ISSUER)).toBe(service);

      expect(databaseStub.withRequest).not.toHaveBeenCalled();
    } finally {
      await moduleRef.close();
    }
  });

  it('เปิดแล้วไม่ยอมเริ่มเมื่อไม่มี JWT secret', async () => {
    await expect(
      createEnabledModule({}),
    ).rejects.toThrow('AUTH_JWT_SECRET_HEX');
  });
});