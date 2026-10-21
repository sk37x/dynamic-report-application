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

import { RefreshSessionUseCase } from '../src/modules/auth/application/refresh-session.use-case';
import type { AuthIdentityReader } from '../src/modules/auth/application/user-identity.ports';
import type { AuthIdentity } from '../src/modules/auth/domain/auth-user';
import { InvalidSessionError } from '../src/modules/auth/domain/invalid-session.error';
import { TestSessionStore } from '../src/modules/auth/infrastructure/testing/test-session.store';
import { TokenSessionService } from '../src/modules/auth/infrastructure/token-session.service';
import { AuthCookies } from '../src/modules/auth/presentation/auth-cookies.service';
import {
  AUTH_COOKIE_NAMES,
  AUTH_HTTP_OPTIONS,
} from '../src/modules/auth/presentation/auth-http.options';
import { AuthOriginGuard } from '../src/modules/auth/presentation/auth-origin.guard';
import { AuthRefreshController } from '../src/modules/auth/presentation/auth-refresh.controller';

describe('POST /api/auth/refresh', () => {
  const origin = 'https://web.example.test';

  let app: INestApplication | undefined;
  let store: TestSessionStore;
  let tokens: TokenSessionService;
  let currentTime: Date;
  let identity: AuthIdentity;

  const findById =
    vi.fn<AuthIdentityReader['findById']>();

  beforeEach(async () => {
    currentTime = new Date('2030-01-01T00:00:00.000Z');

    identity = {
      id: 'user-001',
      username: 'tester',
      displayName: 'ชื่อผู้ใช้ล่าสุด',
      roles: ['USER'],
      permissions: ['report:read'],
      isActive: true,
    };

    findById.mockReset();
    findById.mockResolvedValue(identity);

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
      controllers: [AuthRefreshController],
      providers: [
        {
          provide: RefreshSessionUseCase,
          useFactory: () =>
            new RefreshSessionUseCase(tokens, {
              findById,
            }),
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
    app = undefined;

    vi.restoreAllMocks();
  });

  function postRefresh(
    refreshToken?: string,
    requestOrigin: string | null = origin,
  ) {
    if (!app) {
      throw new Error('Test application is not initialized');
    }

    const result = request(app.getHttpServer())
      .post('/api/auth/refresh');

    if (requestOrigin !== null) {
      result.set('Origin', requestOrigin);
    }

    if (refreshToken !== undefined) {
      result.set(
        'Cookie',
        `${AUTH_COOKIE_NAMES.refresh}=${refreshToken}`,
      );
    }

    return result;
  }

  function readCookie(
    raw: string | string[] | undefined,
    name: string,
  ): { header: string; value: string } {
    const cookies =
      typeof raw === 'string' ? [raw] : (raw ?? []);

    const prefix = `${name}=`;

    const header = cookies.find((cookie) =>
      cookie.startsWith(prefix),
    );

    if (!header) {
      throw new Error(`Missing cookie: ${name}`);
    }

    const value = header
      .slice(prefix.length)
      .split(';')[0];

    return {
      header,
      value: decodeURIComponent(value),
    };
  }

  it('คืน user ล่าสุด ตั้ง cookies ใหม่ และคงวันหมดอายุ session', async () => {
    const previous = await tokens.issue(identity.id);

    // เลื่อนเวลาเพื่อพิสูจน์ว่า refresh ไม่ยืดอายุ session
    currentTime = new Date(
      currentTime.getTime() + 60_000,
    );

    const response = await postRefresh(
      previous.refreshToken,
    ).expect(200);

    expect(response.body).toEqual({
      id: identity.id,
      username: identity.username,
      displayName: identity.displayName,
      roles: identity.roles,
      permissions: identity.permissions,
    });

    expect(findById).toHaveBeenCalledWith(identity.id);

    expect(response.headers['cache-control'])
      .toBe('no-store');

    const access = readCookie(
      response.headers['set-cookie'],
      AUTH_COOKIE_NAMES.access,
    );

    const refresh = readCookie(
      response.headers['set-cookie'],
      AUTH_COOKIE_NAMES.refresh,
    );

    expect(access.value).not.toBe(previous.accessToken);
    expect(refresh.value).not.toBe(previous.refreshToken);

    for (const cookie of [access, refresh]) {
      expect(cookie.header).toContain('HttpOnly');
      expect(cookie.header).toContain('Secure');
      expect(cookie.header).toContain('SameSite=Lax');
      expect(cookie.header).toContain('Path=/');
    }

    expect(refresh.header).toContain(
      `Expires=${previous.refreshTokenExpiresAt.toUTCString()}`,
    );

    const principal =
      await tokens.verifyAccess(access.value);

    expect(principal.userId).toBe(identity.id);

    await expect(
      tokens.verifyRefresh(refresh.value),
    ).resolves.toEqual(principal);

    const stored =
      await store.findById(principal.sessionId);

    expect(stored?.expiresAt).toEqual(
      previous.refreshTokenExpiresAt,
    );

    await expect(
      tokens.verifyRefresh(previous.refreshToken),
    ).rejects.toBeInstanceOf(InvalidSessionError);
  });

  it('refresh ได้เมื่อ access token หมดอายุแล้ว', async () => {
    const previous = await tokens.issue(identity.id);

    currentTime = new Date(
      currentTime.getTime() + 901_000,
    );

    await expect(
      tokens.verifyAccess(previous.accessToken),
    ).rejects.toBeInstanceOf(InvalidSessionError);

    const response = await postRefresh(
      previous.refreshToken,
    ).expect(200);

    const access = readCookie(
      response.headers['set-cookie'],
      AUTH_COOKIE_NAMES.access,
    );

    await expect(
      tokens.verifyAccess(access.value),
    ).resolves.toMatchObject({
      userId: identity.id,
    });
  });

  it('ใช้ refresh token เก่าซ้ำไม่ได้ และไม่ล้าง cookies ของคำขอที่สำเร็จ', async () => {
    const previous = await tokens.issue(identity.id);

    const success = await postRefresh(
      previous.refreshToken,
    ).expect(200);

    const next = readCookie(
      success.headers['set-cookie'],
      AUTH_COOKIE_NAMES.refresh,
    );

    const rejected = await postRefresh(
      previous.refreshToken,
    ).expect(401);

    expect(rejected.headers['set-cookie'])
      .toBeUndefined();

    await expect(
      tokens.verifyRefresh(next.value),
    ).resolves.toMatchObject({
      userId: identity.id,
    });
  });

  it('refresh พร้อมกันด้วย token เดียว สำเร็จได้เพียงหนึ่งคำขอ', async () => {
    const previous = await tokens.issue(identity.id);

    const responses = await Promise.all([
      postRefresh(previous.refreshToken),
      postRefresh(previous.refreshToken),
    ]);

    expect(
      responses.map((response) => response.status).sort(),
    ).toEqual([200, 401]);

    const rejected = responses.find(
      (response) => response.status === 401,
    );

    expect(rejected?.headers['set-cookie'])
      .toBeUndefined();
  });

  it.each([
    { name: 'ไม่มี refresh cookie', token: undefined },
    { name: 'token ไม่ถูกต้อง', token: 'invalid' },
  ])('คืน 401 เมื่อ $name', async ({ token }) => {
    const response =
      await postRefresh(token).expect(401);

    expect(response.headers['set-cookie'])
      .toBeUndefined();

    expect(findById).not.toHaveBeenCalled();
  });

  it.each(['expired', 'revoked'] as const)(
    'คืน 401 เมื่อ session เป็น %s',
    async (state) => {
      const previous = await tokens.issue(identity.id);

      if (state === 'expired') {
        currentTime = new Date(
          previous.refreshTokenExpiresAt.getTime(),
        );
      } else {
        const verified =
          await tokens.verifyAccess(previous.accessToken);

        await tokens.revokeSession(verified.sessionId);
      }

      await postRefresh(
        previous.refreshToken,
      ).expect(401);

      expect(findById).not.toHaveBeenCalled();
    },
  );

  it.each(['missing', 'inactive'] as const)(
    'คืน 401 เมื่อบัญชีเป็น %s และไม่ rotate token',
    async (state) => {
      const previous = await tokens.issue(identity.id);

      findById.mockResolvedValueOnce(
        state === 'missing'
          ? null
          : { ...identity, isActive: false },
      );

      const response = await postRefresh(
        previous.refreshToken,
      ).expect(401);

      expect(response.headers['set-cookie'])
        .toBeUndefined();

      // ตรวจเฉพาะ token/session ว่ายังไม่ถูก rotate
      // การอนุญาตให้ใช้งานยังต้องผ่านการตรวจบัญชีด้วย
      await expect(
        tokens.verifyRefresh(previous.refreshToken),
      ).resolves.toMatchObject({
        userId: identity.id,
      });
    },
  );

  it.each([
    { name: 'ไม่มี Origin', value: null },
    { name: 'Origin เป็น null', value: 'null' },
    {
      name: 'Origin ที่ไม่ได้อนุญาต',
      value: 'https://untrusted.example',
    },
  ])('คืน 403 เมื่อ $name', async ({ value }) => {
    const previous = await tokens.issue(identity.id);

    const response = await postRefresh(
      previous.refreshToken,
      value,
    ).expect(403);

    expect(response.headers['set-cookie'])
      .toBeUndefined();

    expect(findById).not.toHaveBeenCalled();

    await expect(
      tokens.verifyRefresh(previous.refreshToken),
    ).resolves.toMatchObject({
      userId: identity.id,
    });
  });

  it('คืน 500 โดยไม่เปิดเผยรายละเอียดเมื่ออ่านบัญชีไม่ได้', async () => {
    const previous = await tokens.issue(identity.id);

    findById.mockRejectedValueOnce(
      new Error('Database connection failed: internal-details'),
    );

    const response = await postRefresh(
      previous.refreshToken,
    ).expect(500);

    expect(response.text).not.toContain('internal-details');
    expect(response.headers['set-cookie'])
      .toBeUndefined();

    await expect(
      tokens.verifyRefresh(previous.refreshToken),
    ).resolves.toMatchObject({
      userId: identity.id,
    });
  });

  it('คืน 500 และไม่ออก cookies เมื่อบันทึก rotation ล้มเหลว', async () => {
    const previous = await tokens.issue(identity.id);

    vi.spyOn(store, 'rotateRefreshToken')
      .mockRejectedValueOnce(
        new Error('Database write failed: internal-details'),
      );

    const response = await postRefresh(
      previous.refreshToken,
    ).expect(500);

    expect(response.text).not.toContain('internal-details');
    expect(response.headers['set-cookie'])
      .toBeUndefined();
  });
});