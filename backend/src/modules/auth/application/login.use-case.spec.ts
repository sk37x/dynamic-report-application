import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthIdentity } from '../domain/auth-user';
import { InvalidCredentialsError } from '../domain/invalid-credentials.error';

import type {
    CredentialVerifier,
    IssuedSession,
    SessionIssuer,
} from './auth.ports';

import { LoginUseCase } from './login.use-case';

const identity: AuthIdentity = {
    id: 'user-001',
    username: 'demo',
    displayName: 'Demo User',
    roles: ['USER'],
    permissions: ['REPORT_VIEW'],
    isActive: true,
};


// เป็นข้อมูลจำลองสำหรับ test ไม่ใช่ token ที่ใช้งานจริง
const issuedSession: IssuedSession = {
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    accessTokenExpiresAt: new Date('2030-01-01T00:15:00Z'),
    refreshTokenExpiresAt: new Date('2030-01-08T00:15:00Z'),
}

const verify = vi.fn<CredentialVerifier['verify']>();
const issue = vi.fn<SessionIssuer['issue']>();

let useCase: LoginUseCase;

beforeEach(() => {
    verify.mockReset().mockResolvedValue(identity);
    issue.mockReset().mockResolvedValue(issuedSession);

    useCase = new LoginUseCase(
        { verify },
        { issue },
    );
});

describe('LoginUseCase', () => {
    it('trim username แต่รักษา password และคืนเฉพาะข้อมูลผู้ใช้ที่อนุญาต', async () => {
        // สมมุติ adapter ส่ง field ภายในเกินมาด้วย
        const identityWithExtraFields = {
            ...identity,
            passwordHash: 'must-not-be-returned',
        }

        verify.mockResolvedValueOnce(identityWithExtraFields);

        const result = await useCase.execute({
            username: ' demo ',
            password: ' password-with-spaces ',
        })

        expect(verify).toHaveBeenCalledWith({
            username: 'demo',
            password: ' password-with-spaces ',
        });

        expect(issue).toHaveBeenCalledWith('user-001');

        expect(result.user).toEqual({
            id: 'user-001',
            username: 'demo',
            displayName: 'Demo User',
            roles: ['USER'],
            permissions: ['REPORT_VIEW'],
        });

        expect(result.user).not.toHaveProperty('passwordHash');
        expect(result.user).not.toHaveProperty('isActive');

        expect(result.session).toEqual(issuedSession);
    });

    it('credentials ไม่ถูกต้องแล้วไม่ออก session', async () => {
        verify.mockResolvedValueOnce(null);

        await expect(
            useCase.execute({
                username: 'demo',
                password: 'wrong-password',
            }),
        ).rejects.toBeInstanceOf(InvalidCredentialsError);

        expect(issue).not.toHaveBeenCalled();
    });

    it('บัญชีถูกปิดแล้วไม่ออก session', async () => {
        verify.mockResolvedValueOnce({
            ...identity,
            isActive: false,
        });

        await expect(
            useCase.execute({
                username: 'demo',
                password: 'correct-password',
            }),
        ).rejects.toBeInstanceOf(InvalidCredentialsError);

        expect(issue).not.toHaveBeenCalled();
    });

    it.each([
        { username: '', password: 'password' },
        { username: '    ', password: 'password' },
        { username: 'demo', password: '' },
    ])(
        'ข้อมูลวว่างแล้วไม่เรียก verifier: username="$username"',
        async (input) => {
            await expect(
                useCase.execute(input),
            ).rejects.toBeInstanceOf(InvalidCredentialsError);

            expect(verify).not.toHaveBeenCalled();
            expect(issue).not.toHaveBeenCalled();
        },
    );

    it('ระบบตรวจผู้ใช้ล่มแล้วส่ง error เดิม ไม่แปลงเป็นรหัสผ่านผิด', async () => {
        const failure = new Error('Identity provider unavailable');

        verify.mockRejectedValueOnce(failure);

        await expect(
            useCase.execute({
                username: 'demo',
                password: 'password',
            })
        ).rejects.toBe(failure);

        expect(issue).not.toHaveBeenCalled();
    });

    it('ออก session ไม่สำเร็จแล้วไม่คืนผล login สำเร็จ', async () => {
        const failure = new Error('Session storage unavailable');

        issue.mockRejectedValueOnce(failure);

        await expect(
            useCase.execute({
                username: 'demo',
                password: 'password',
            }),
        ).rejects.toBe(failure);
    });
});