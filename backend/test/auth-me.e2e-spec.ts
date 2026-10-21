import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import cookieParser from 'cookie-parser';
import request from 'supertest';

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  AuthenticateSessionUseCase,
} from '../src/modules/auth/application/authenticate-session.use-case';

import type {
  AuthIdentityReader,
} from '../src/modules/auth/application/user-identity.ports';

import type {
  AuthIdentity,
} from '../src/modules/auth/domain/auth-user';

import {
  TokenSessionService,
} from '../src/modules/auth/infrastructure/token-session.service';

import {
  TestSessionStore,
} from '../src/modules/auth/infrastructure/testing/test-session.store';

import {
  AuthMeController,
} from '../src/modules/auth/presentation/auth-me.controller';

import {
  AuthSessionGuard,
} from '../src/modules/auth/presentation/auth-session.guard';

import {
  AUTH_COOKIE_NAMES,
} from '../src/modules/auth/presentation/auth-http.options';

describe('GET /api/auth/me', () => {
  let app: INestApplication | undefined;
  let server: Server;

  let sessions: TestSessionStore;
  let tokens: TokenSessionService;
  let now: Date;

  const findById = vi.fn<AuthIdentityReader['findById']>();

  const identity: AuthIdentity = {
    id: 'user-001',
    username: 'tester',
    displayName: 'ผู้ใช้ทดสอบ',
    isActive: true,
    roles: [],
    permissions: [],
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthMeController],

      providers: [
        {
          provide: AuthenticateSessionUseCase,

          useFactory: () => {
            return new AuthenticateSessionUseCase(
              {
                verifyAccess: (token: string) => {
                  return tokens.verifyAccess(token);
                },
              },
              {
                findById,
              },
            );
          },
        },

        AuthSessionGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication({
      logger: false,
    });

    app.setGlobalPrefix('api');
    app.use(cookieParser());

    await app.init();

    server = app.getHttpServer();
  });

  beforeEach(() => {
    vi.restoreAllMocks();

    findById.mockReset();
    findById.mockResolvedValue(identity);

    now = new Date('2030-01-01T00:00:00.000Z');

    sessions = new TestSessionStore();

    tokens = new TokenSessionService(
      sessions,
      {
        secretHex: 'ab'.repeat(32),
        issuer: 'test-api',
        audience: 'test-web',
        accessTtlSeconds: 900,
        sessionTtlSeconds: 604800,
      },
      () => now,
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  function getMe(accessToken?: string) {
    const operation = request(server)
      .get('/api/auth/me');

    if (accessToken !== undefined) {
      operation.set(
        'Cookie',
        `${AUTH_COOKIE_NAMES.access}=${accessToken}`,
      );
    }

    return operation;
  }

  it('คืนข้อมูลผู้ใช้ปัจจุบันเมื่อ token และ session ถูกต้อง', async () => {
    const issued = await tokens.issue(identity.id);

    findById.mockResolvedValue({
      ...identity,
      displayName: 'ชื่อที่เปลี่ยนหลัง login',
    });

    const response = await getMe(issued.accessToken)
      .expect(200);

    expect(response.body).toEqual({
      id: identity.id,
      username: identity.username,
      displayName: 'ชื่อที่เปลี่ยนหลัง login',
      roles: [],
      permissions: [],
    });

    expect(response.body).not.toHaveProperty('isActive');
    expect(response.body).not.toHaveProperty('sessionId');

    expect(response.headers['cache-control']).toBe('no-store');

    expect(findById).toHaveBeenCalledWith(identity.id);
  });

  it('คืน 401 เมื่อไม่มี access cookie', async () => {
    await getMe().expect(401);

    expect(findById).not.toHaveBeenCalled();
  });

  it('คืน 401 เมื่อ token ไม่ถูกต้อง', async () => {
    await getMe('not-a-valid-jwt').expect(401);

    expect(findById).not.toHaveBeenCalled();
  });

  it('คืน 401 เมื่อ access token หมดอายุ', async () => {
    const issued = await tokens.issue(identity.id);

    now = new Date(now.getTime() + 901_000);

    await getMe(issued.accessToken).expect(401);

    expect(findById).not.toHaveBeenCalled();
  });

  it('ไม่ยอมรับ refresh token แทน access token', async () => {
    const issued = await tokens.issue(identity.id);

    await getMe(issued.refreshToken).expect(401);

    expect(findById).not.toHaveBeenCalled();
  });

  it('คืน 401 เมื่อ session ถูก revoke แม้ JWT ยังไม่หมดอายุ', async () => {
    const issued = await tokens.issue(identity.id);

    const verified = await tokens.verifyAccess(
      issued.accessToken,
    );

    await tokens.revokeSession(verified.sessionId);

    await getMe(issued.accessToken).expect(401);

    expect(findById).not.toHaveBeenCalled();
  });

  it.each([
    'missing',
    'inactive',
  ])('คืน 401 เมื่อบัญชีเป็น %s', async (state) => {
    const issued = await tokens.issue(identity.id);

    findById.mockResolvedValue(
      state === 'missing'
        ? null
        : {
            ...identity,
            isActive: false,
          },
    );

    await getMe(issued.accessToken).expect(401);
  });

  it.each([
    'session-store',
    'identity-reader',
  ])('คืน 500 เมื่อ %s มีปัญหา', async (source) => {
    const issued = await tokens.issue(identity.id);

    const failure = new Error(
      'Database unavailable: internal-details',
    );

    if (source === 'session-store') {
      vi.spyOn(sessions, 'findById')
        .mockRejectedValue(failure);
    } else {
      findById.mockRejectedValue(failure);
    }

    const response = await getMe(issued.accessToken)
      .expect(500);

    expect(response.text).not.toContain('internal-details');
  });
});