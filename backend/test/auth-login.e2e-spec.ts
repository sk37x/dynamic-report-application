import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

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

import type {
  CredentialVerifier,
  SessionIssuer,
} from '../src/modules/auth/application/auth.ports';

import { LoginUseCase } from '../src/modules/auth/application/login.use-case';
import { AuthModule } from '../src/modules/auth/auth.module';

import { AuthController } from '../src/modules/auth/presentation/auth.controller';
import { AuthCookies } from '../src/modules/auth/presentation/auth-cookies.service';
import { AuthOriginGuard } from '../src/modules/auth/presentation/auth-origin.guard';

import {
  AUTH_COOKIE_NAMES,
  AUTH_HTTP_OPTIONS,
} from '../src/modules/auth/presentation/auth-http.options';

describe('POST /api/auth/login', () => {
  let app: INestApplication | undefined;
  let server: Server;

  const origin = 'https://web.example.test';

  const verify = vi.fn<CredentialVerifier['verify']>();
  const issue = vi.fn<SessionIssuer['issue']>();

  const user = {
    id: 'user-001',
    username: 'tester',
    displayName: 'ผู้ใช้ทดสอบ',
    roles: [],
    permissions: [],
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],

      providers: [
        {
          provide: LoginUseCase,
          useFactory: () => {
            return new LoginUseCase(
              { verify },
              { issue },
            );
          },
        },

        {
          provide: AUTH_HTTP_OPTIONS,
          useValue: {
            allowedOrigin: origin,
            secureCookies: true,
          },
        },

        AuthCookies,
        AuthOriginGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication({
      logger: false,
    });

    app.setGlobalPrefix('api');

    await app.init();

    server = app.getHttpServer();
  });

  beforeEach(() => {
    verify.mockReset();
    issue.mockReset();

    verify.mockResolvedValue({
      ...user,
      isActive: true,
    });

    issue.mockResolvedValue({
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      accessTokenExpiresAt: new Date(Date.now() + 900_000),
      refreshTokenExpiresAt: new Date(Date.now() + 604_800_000),
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('คืน user และตั้ง HttpOnly cookies เมื่อ login สำเร็จ', async () => {
    const response = await request(server)
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({
        username: 'tester',
        password: 'Test password',
      })
      .expect(200);

    expect(response.body).toEqual(user);
    expect(response.headers['cache-control']).toBe('no-store');

    const rawCookies = response.headers['set-cookie'];

    const cookies: string[] = Array.isArray(rawCookies)
      ? rawCookies
      : rawCookies
        ? [rawCookies]
        : [];

    expect(cookies).toHaveLength(2);

    expect(cookies).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          `${AUTH_COOKIE_NAMES.access}=test-access-token`,
        ),
        expect.stringContaining(
          `${AUTH_COOKIE_NAMES.refresh}=test-refresh-token`,
        ),
      ]),
    );

    for (const cookie of cookies) {
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('Expires=');
    }

    expect(issue).toHaveBeenCalledWith(user.id);
  });

  it('คืน 401 และไม่ออก session เมื่อ credentials ผิด', async () => {
    verify.mockResolvedValue(null);

    const response = await request(server)
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({
        username: 'tester',
        password: 'Wrong password',
      })
      .expect(401);

    expect(issue).not.toHaveBeenCalled();
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('คืน 400 ก่อนตรวจ credentials เมื่อ body ไม่ถูกต้อง', async () => {
    await request(server)
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({
        username: 'tester',
        password: '',
      })
      .expect(400);

    expect(verify).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    'null',
    'https://untrusted.example',
  ])('ปฏิเสธ Origin: %s', async (requestOrigin) => {
    const operation = request(server)
      .post('/api/auth/login');

    if (requestOrigin !== undefined) {
      operation.set('Origin', requestOrigin);
    }

    await operation
      .send({
        username: 'tester',
        password: 'Test password',
      })
      .expect(403);

    expect(verify).not.toHaveBeenCalled();
  });

  it('คืน 500 โดยไม่เปิดเผยรายละเอียดระบบภายใน', async () => {
    verify.mockRejectedValue(
      new Error('Database connection failed: internal-details'),
    );

    const response = await request(server)
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({
        username: 'tester',
        password: 'Test password',
      })
      .expect(500);

    expect(response.text).not.toContain('internal-details');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(issue).not.toHaveBeenCalled();
  });
});

describe('Auth disabled', () => {
  it('ไม่สร้าง login endpoint และไม่ต้องมีฐานข้อมูล', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AuthModule.register({
          enabled: false,
        }),
      ],
    }).compile();

    const app = moduleRef.createNestApplication({
      logger: false,
    });

    try {
      app.setGlobalPrefix('api');
      await app.init();

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          username: 'tester',
          password: 'Test password',
        })
        .expect(404);
    } finally {
      await app.close();
    }
  });
});