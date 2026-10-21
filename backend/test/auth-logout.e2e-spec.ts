import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { LogoutUseCase } from '../src/modules/auth/application/logout.use-case';
import { InvalidSessionError } from '../src/modules/auth/domain/invalid-session.error';
import { TestSessionStore } from '../src/modules/auth/infrastructure/testing/test-session.store';
import { TokenSessionService } from '../src/modules/auth/infrastructure/token-session.service';
import { AuthCookies } from '../src/modules/auth/presentation/auth-cookies.service';
import {
  AUTH_COOKIE_NAMES,
  AUTH_HTTP_OPTIONS,
} from '../src/modules/auth/presentation/auth-http.options';
import { AuthLogoutController } from '../src/modules/auth/presentation/auth-logout.controller';
import { AuthOriginGuard } from '../src/modules/auth/presentation/auth-origin.guard';

describe('POST /api/auth/logout', () => {
  const origin = 'https://web.example.test';

  let app: INestApplication | undefined;
  let store: TestSessionStore;
  let tokens: TokenSessionService;
  let currentTime: Date;

  beforeEach(async () => {
    currentTime = new Date('2030-01-01T00:00:00.000Z');

    store = new TestSessionStore();

    tokens = new TokenSessionService(
      store,
      {
        secretHex: 'ab'.repeat(32),
        issuer: 'test-api',
        audience: 'test-web',
        accessTtlSeconds: 900,
        sessionTtlSeconds: 604800,
      },
      () => new Date(currentTime.getTime()),
    );

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthLogoutController],
      providers: [
        {
          provide: LogoutUseCase,
          useFactory: () => new LogoutUseCase(tokens),
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
    app.use(cookieParser());

    await app.init();
  });

  afterEach(async () => {
    await app?.close();
    vi.restoreAllMocks();
  });

  function postLogout(
    cookies: string[] = [],
    requestOrigin: string = origin,
  ) {
    if (!app) {
      throw new Error('Test application is not initialized');
    }

    const result = request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Origin', requestOrigin);

    if (cookies.length > 0) {
      result.set('Cookie', cookies.join('; '));
    }

    return result;
  }

  function expectClearedCookies(
    raw: string | string[] | undefined,
  ): void {
    const cookies =
      typeof raw === 'string' ? [raw] : (raw ?? []);

    expect(cookies).toHaveLength(2);

    for (const name of [
      AUTH_COOKIE_NAMES.access,
      AUTH_COOKIE_NAMES.refresh,
    ]) {
      const cookie = cookies.find((value) =>
        value.startsWith(`${name}=`),
      );

      expect(cookie).toBeDefined();
      expect(cookie).toContain(`${name}=;`);
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain(
        'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
      );
    }
  }

  it('คืน 204 ล้าง cookies และทำให้ token เดิมใช้ไม่ได้', async () => {
    const session = await tokens.issue('user-001');

    const response = await postLogout([
      `${AUTH_COOKIE_NAMES.access}=${session.accessToken}`,
      `${AUTH_COOKIE_NAMES.refresh}=${session.refreshToken}`,
    ]).expect(204);

    expect(response.text).toBe('');
    expect(response.headers['cache-control']).toBe('no-store');

    expectClearedCookies(response.headers['set-cookie']);

    await expect(
      tokens.verifyAccess(session.accessToken),
    ).rejects.toBeInstanceOf(InvalidSessionError);

    await expect(
      tokens.refresh(session.refreshToken),
    ).rejects.toBeInstanceOf(InvalidSessionError);
  });

  it('logout ได้เมื่อ access หมดอายุ แต่ refresh ยังใช้ได้', async () => {
    const session = await tokens.issue('user-001');

    currentTime = new Date(
      currentTime.getTime() + 901_000,
    );

    await postLogout([
      `${AUTH_COOKIE_NAMES.access}=${session.accessToken}`,
      `${AUTH_COOKIE_NAMES.refresh}=${session.refreshToken}`,
    ]).expect(204);

    await expect(
      tokens.refresh(session.refreshToken),
    ).rejects.toBeInstanceOf(InvalidSessionError);
  });

  it('logout ได้ด้วย access token เพียงอย่างเดียว', async () => {
    const session = await tokens.issue('user-001');

    await postLogout([
      `${AUTH_COOKIE_NAMES.access}=${session.accessToken}`,
    ]).expect(204);

    await expect(
      tokens.verifyAccess(session.accessToken),
    ).rejects.toBeInstanceOf(InvalidSessionError);
  });

  it('refresh token ปลอมที่ใช้ session ID จริงต้อง revoke ไม่ได้', async () => {
    const session = await tokens.issue('user-001');

    const [sessionId, secret] =
      session.refreshToken.split('.');

    const forgedSecret =
      (secret[0] === '0' ? '1' : '0') + secret.slice(1);

    await postLogout([
      `${AUTH_COOKIE_NAMES.refresh}=${sessionId}.${forgedSecret}`,
    ]).expect(204);

    // Session ของเจ้าของ token จริงต้องยังใช้ได้
    await expect(
      tokens.verifyAccess(session.accessToken),
    ).resolves.toMatchObject({
      userId: 'user-001',
      sessionId,
    });
  });

  it('เรียก logout ซ้ำได้', async () => {
    const session = await tokens.issue('user-001');

    const cookies = [
      `${AUTH_COOKIE_NAMES.access}=${session.accessToken}`,
      `${AUTH_COOKIE_NAMES.refresh}=${session.refreshToken}`,
    ];

    await postLogout(cookies).expect(204);

    const response =
      await postLogout(cookies).expect(204);

    expectClearedCookies(response.headers['set-cookie']);
  });

  it.each([
    {
      name: 'ไม่มี cookies',
      cookies: [],
    },
    {
      name: 'token รูปแบบไม่ถูกต้อง',
      cookies: [
        `${AUTH_COOKIE_NAMES.access}=invalid`,
        `${AUTH_COOKIE_NAMES.refresh}=invalid`,
      ],
    },
  ])('คืน 204 และล้าง cookies เมื่อ $name', async ({ cookies }) => {
    const response =
      await postLogout(cookies).expect(204);

    expectClearedCookies(response.headers['set-cookie']);
  });

  it('ปฏิเสธ Origin ที่ไม่ได้อนุญาตและไม่ revoke session', async () => {
    const session = await tokens.issue('user-001');

    const response = await postLogout(
      [
        `${AUTH_COOKIE_NAMES.refresh}=${session.refreshToken}`,
      ],
      'https://untrusted.example',
    ).expect(403);

    expect(response.headers['set-cookie']).toBeUndefined();

    await expect(
      tokens.verifyAccess(session.accessToken),
    ).resolves.toMatchObject({
      userId: 'user-001',
    });
  });

  it('คืน 500 และไม่ล้าง cookies เมื่อบันทึก revoke ไม่สำเร็จ', async () => {
    const session = await tokens.issue('user-001');

    vi.spyOn(store, 'revoke').mockRejectedValueOnce(
      new Error('Database connection failed: internal-details'),
    );

    const response = await postLogout([
      `${AUTH_COOKIE_NAMES.refresh}=${session.refreshToken}`,
    ]).expect(500);

    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.text).not.toContain('internal-details');

    // Mock ทำให้ revoke ล้มเหลว session จึงยังไม่ถูกเพิกถอน
    await expect(
      tokens.verifyAccess(session.accessToken),
    ).resolves.toMatchObject({
      userId: 'user-001',
    });
  });
});