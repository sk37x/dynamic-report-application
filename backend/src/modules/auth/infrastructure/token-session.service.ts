import {
    createHash,
    randomBytes,
    randomUUID,
    timingSafeEqual,
} from 'node:crypto';
import { errors, jwtVerify, SignJWT } from 'jose';

import type {
    IssuedSession,
    SessionIssuer
} from '../application/auth.ports'

import type {
    AuthSessionRecord,
    SessionStore,
} from '../application/session.store';

import { InvalidSessionError } from '../domain/invalid-session.error';

export type TokenSessionOptions = {
    // ค่าสุ่ม 32 bytes ที่เขียนในรูป hex = 64 ตัวอักษร
    secretHex: string;

    issuer: string;
    audience: string;

    accessTtlSeconds: number;
    sessionTtlSeconds: number;
};

export type VerifiedSession = {
    userId: string;
    sessionId: string;
}

export class TokenSessionService implements SessionIssuer {
    private readonly key: Uint8Array;

    constructor(
        private readonly store: SessionStore,
        private readonly options: TokenSessionOptions,
        private readonly now: () => Date = () => new Date(),
    ) {
        if (!/^[0-9a-f]{64}$/i.test(options.secretHex)) {
            throw new Error('Auth secret must be a 32-byte hex value.');
        }

        if (!options.issuer.trim() || !options.audience.trim()) {
            throw new Error(`Auth issuer and audience are required.'`);
        }

        if (
            !Number.isSafeInteger(options.accessTtlSeconds) ||
            !Number.isSafeInteger(options.sessionTtlSeconds) ||
            options.accessTtlSeconds < 1 ||
            options.sessionTtlSeconds <= options.accessTtlSeconds
        ) {
            throw new Error('Invalid auth token lifetimes.');
        }

        this.key = Buffer.from(options.secretHex, 'hex');
    }

    async issue(userId: string): Promise<IssuedSession> {
        if (!userId.trim()) {
            throw new Error(`Cannot issue a session without userId.`);
        }

        const session: AuthSessionRecord = {
            id: randomUUID(),
            userId,
            refreshTokenHash: '',
            expiresAt: new Date(
                this.now().getTime() + this.options.sessionTtlSeconds * 1000,
            ),
            revokedAt: null
        };

        const tokens = await this.createTokens(session);

        session.refreshTokenHash = this.hash(tokens.refreshToken);

        await this.store.create(session);

        return tokens;
    }

    async verifyAccess(accessToken: string): Promise<VerifiedSession> {
        let userId: string = "";
        let sessionId: string = "";

        try {
            const { payload } = await jwtVerify(accessToken, this.key, {
                algorithms: ['HS256'],
                issuer: this.options.issuer,
                audience: this.options.audience,
                typ: 'JWT',
                requiredClaims: ['sub', 'sid', 'iat', 'exp', 'token_use'],
                currentDate: this.now(),
            });

            if (
                typeof payload.sub !== 'string' ||
                typeof payload.sid !== 'string' ||
                payload.token_use !== 'access'
            ) {
                throw new InvalidSessionError();
            }

            userId = payload.sub;
            sessionId = payload.sid;
        } catch (error) {
            if (error instanceof errors.JOSEError) {
                throw new InvalidSessionError();
            }
        }

        const session = await this.getActiveSession(sessionId);

        if (session.userId !== userId) {
            throw new InvalidSessionError();
        }

        return { userId, sessionId }
    }

    async refresh(refreshToken: string): Promise<IssuedSession> {
        const match = /^([0-9a-f-]{36})\.([0-9a-f]{64})$/.exec(refreshToken);

        if (!match) {
            throw new InvalidSessionError();
        }

        const session = await this.getActiveSession(match[1]);
        const currentHash = this.hash(refreshToken);

        if (!this.sameHash(currentHash, session.refreshTokenHash)) {
            throw new InvalidSessionError();
        }

        const tokens = await this.createTokens(session);

        // มี request แข่งกันได้ ต้องตัดสินกันที่ store แบบ atomic
        const rotated = await this.store.rotateRefreshToken(
            session.id,
            currentHash,
            this.hash(tokens.refreshToken),
            this.now(),
        )

        if (!rotated) {
            throw new InvalidSessionError();
        }

        return tokens;
    }

    /**
     * ใช้ภายใน backend เท่านั้น: 
     * sessionId ต้องมาจากการตรวจ token/สิทธิ์แล้ว
     * ไม่รับ sessionId จาก body ของผู้ใช้มา revoke ตรง ๆ
     */
    async revokeSession(sessionId: string): Promise<void> {
        await this.store.revoke(sessionId, this.now());
    }

    private async getActiveSession(id: string): Promise<AuthSessionRecord> {
        const session = await this.store.findById(id);

        if (
            !session ||
            session.revokedAt !== null ||
            session.expiresAt.getTime() <= this.now().getTime()
        ) {
            throw new InvalidSessionError();
        }

        return session;
    }

    private async createTokens(session: AuthSessionRecord,): Promise<IssuedSession> {
        const now = this.now();

        // Access token ต้องไม่อยู่นานกว่า session
        const expiresAtSeconds = Math.floor(
            Math.min(
                now.getTime() + this.options.accessTtlSeconds * 1000,
                session.expiresAt.getTime(),
            ) / 1000,
        );

        if (expiresAtSeconds <= Math.floor(now.getTime() / 1000)) {
            throw new InvalidSessionError();
        }

        const accessToken = await new SignJWT({ sid: session.id, token_use: 'access', })
            .setProtectedHeader({ alg: 'HS256', typ: "JWT" })
            .setSubject(session.userId)
            .setIssuer(this.options.issuer)
            .setAudience(this.options.audience)
            .setIssuedAt(Math.floor(now.getTime() / 1000))
            .setExpirationTime(expiresAtSeconds)
            .setJti(randomUUID())
            .sign(this.key);

        const refreshToken = `${session.id}.${randomBytes(32).toString('hex')}`;

        return {
            accessToken,
            refreshToken,
            accessTokenExpiresAt: new Date(expiresAtSeconds * 1000),

            // เป็น absolute expiry: refresh ไม่ยืดอายุ session ไปเรื่อย ๆ
            refreshTokenExpiresAt: new Date(session.expiresAt.getTime()),
        }
    }

    private hash(value: string): string {
        return createHash('sha256').update(value).digest('hex');
    }

    private sameHash(left: string, right: string): boolean {
        const leftBuffer = Buffer.from(left, 'utf8');
        const rightBuffer = Buffer.from(right, 'utf8');

        return (
            leftBuffer.length === rightBuffer.length &&
            timingSafeEqual(leftBuffer, rightBuffer)
        )
    }

    async verifyRefresh(
        token: string,
    ): Promise<{ userId: string; sessionId: string }> {
        const match =
            /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-f]{64})$/.exec(
                token,
            );

        if (!match) {
            throw new InvalidSessionError();
        }

        const sessionId = match[1];

        // ตัวเดิมตรวจว่า session มีอยู่ ยังไม่ถูก revoke และยังไม่หมดอายุ
        const session = await this.getActiveSession(sessionId);

        const actualHash = createHash('sha256')
            .update(token)
            .digest();

        const expectedHash = Buffer.from(
            session.refreshTokenHash,
            'hex',
        );

        if (
            actualHash.length !== expectedHash.length ||
            !timingSafeEqual(actualHash, expectedHash)
        ) {
            throw new InvalidSessionError();
        }

        return {
            userId: session.userId,
            sessionId: session.id,
        };
    }
}