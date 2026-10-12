import type {
    AuthSessionRecord,
    SessionStore,
} from '../../application/session.store'

/**
 * Test double เท่านั้น
 * ห้ามนำไปลงทะเบียนเป็น production session store
 */

export class TestSessionStore implements SessionStore {
    private readonly sessions = new Map<string, AuthSessionRecord>();

    create(session: AuthSessionRecord): Promise<void> {
        if(this.sessions.has(session.id)) {
            return Promise.reject(new Error('Dupplicate session ID'));
        }
        
        this.sessions.set(session.id, structuredClone(session));
        return Promise.resolve();
    }

    findById(id: string): Promise<AuthSessionRecord | null> {
        const session = this.sessions.get(id);

        return Promise.resolve(session ? structuredClone(session) : null);
    }

    rotateRefreshToken(
        id: string,
        expectedHash: string,
        nextHash: string,
        now: Date,
    ): Promise<boolean> {
        const session = this.sessions.get(id);

        if(
            !session ||
            (session.revokedAt && session.revokedAt.getTime() <= now.getTime()) ||
            session.refreshTokenHash !== expectedHash
        ) {
            return Promise.resolve(false);
        }

        // ไม่มี await ระหว่างตรวจและอัปเดต:
        // จำลอง atomic operation ภายใน process เดียว
        session.refreshTokenHash = nextHash;

        return Promise.resolve(true);
    }

    revoke(id: string, now: Date): Promise<void> {
        const session = this.sessions.get(id);

        if(session && session.revokedAt === null) {
            session.revokedAt = new Date(now.getTime());
        }

        return Promise.resolve();
    }
}