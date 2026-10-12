import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvalidSessionError } from '../domain/invalid-session.error';
import { TestSessionStore } from './testing/test-session.store';
import { TokenSessionService } from './token-session.service';

let store: TestSessionStore;
let service: TokenSessionService;
let clock: number;

beforeEach(() => {
  clock = Date.parse('2030-01-01T00:00:00Z');
  store = new TestSessionStore();

  service = new TokenSessionService(
    store,
    {
      // ใช้เฉพาะ test
      secretHex: 'ab'.repeat(32),
      issuer: 'template-api',
      audience: 'template-web',
      accessTtlSeconds: 900,
      sessionTtlSeconds: 7 * 24 * 60 * 60,
    },
    () => new Date(clock),
  );
});

describe('TokenSessionService', () => {
  it('ออก token ตรวจกลับได้ และเก็บเฉพาะ refresh hash', async () => {
    const tokens = await service.issue('user-001');
    const verified = await service.verifyAccess(tokens.accessToken);
    const saved = await store.findById(verified.sessionId);

    expect(verified.userId).toBe('user-001');
    expect(saved?.refreshTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(saved).not.toHaveProperty('refreshToken');
    expect(saved?.refreshTokenHash).not.toBe(tokens.refreshToken);
  });

  it('ปฏิเสธ access token ที่ถูกแก้ payload', async () => {
    const tokens = await service.issue('user-001');
    const [header, payload, signature] = tokens.accessToken.split('.');

    const changedPayload = {
      ...JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
      sub: 'another-user',
    };

    const tampered =
      `${header}.` +
      Buffer.from(JSON.stringify(changedPayload)).toString('base64url') +
      `.${signature}`;

    await expect(
      service.verifyAccess(tampered),
    ).rejects.toBeInstanceOf(InvalidSessionError);
  });

  it('access หมดอายุแล้วใช้ไม่ได้ แต่ refresh ยังใช้ได้', async () => {
    const tokens = await service.issue('user-001');

    clock += 901 * 1000;

    await expect(
      service.verifyAccess(tokens.accessToken),
    ).rejects.toBeInstanceOf(InvalidSessionError);

    const refreshed = await service.refresh(tokens.refreshToken);

    await expect(
      service.verifyAccess(refreshed.accessToken),
    ).resolves.toMatchObject({ userId: 'user-001' });
  });

  it('session หมดอายุแล้ว refresh ไม่ได้', async () => {
    const tokens = await service.issue('user-001');

    clock += 7 * 24 * 60 * 60 * 1000;

    await expect(
      service.refresh(tokens.refreshToken),
    ).rejects.toBeInstanceOf(InvalidSessionError);
  });

  it('refresh แล้วตัวเก่าใช้ซ้ำไม่ได้ และไม่ยืด session expiry', async () => {
    const original = await service.issue('user-001');
    const refreshed = await service.refresh(original.refreshToken);

    expect(refreshed.refreshToken).not.toBe(original.refreshToken);

    expect(refreshed.refreshTokenExpiresAt).toEqual(
      original.refreshTokenExpiresAt,
    );

    await expect(
      service.refresh(original.refreshToken),
    ).rejects.toBeInstanceOf(InvalidSessionError);

    await expect(
      service.verifyAccess(refreshed.accessToken),
    ).resolves.toMatchObject({ userId: 'user-001' });
  });

  it('refresh พร้อมกันด้วย token เดิม สำเร็จเพียงหนึ่ง request', async () => {
    const tokens = await service.issue('user-001');

    const results = await Promise.allSettled([
      service.refresh(tokens.refreshToken),
      service.refresh(tokens.refreshToken),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);

    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
  });

  it('revoke แล้ว access และ refresh ใช้ไม่ได้', async () => {
    const tokens = await service.issue('user-001');
    const verified = await service.verifyAccess(tokens.accessToken);

    await service.revokeSession(verified.sessionId);

    await expect(
      service.verifyAccess(tokens.accessToken),
    ).rejects.toBeInstanceOf(InvalidSessionError);

    await expect(
      service.refresh(tokens.refreshToken),
    ).rejects.toBeInstanceOf(InvalidSessionError);
  });

  it('storage ล่มแล้วไม่แปลงเป็น invalid token', async () => {
    const tokens = await service.issue('user-001');
    const failure = new Error('Session database unavailable');

    vi.spyOn(store, 'findById').mockRejectedValueOnce(failure);

    await expect(
      service.verifyAccess(tokens.accessToken),
    ).rejects.toBe(failure);
  });
});