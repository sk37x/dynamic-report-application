import sql from 'mssql';

import { MssqlDatabase } from '../../../infrastructure/database/mssql/mssql.database';
import type {
    AuthSessionRecord,
    SessionStore,
} from '../application/session.store';

type SessionRow = {
    id: string;
    userId: string;
    refreshTokenHash: Buffer;
    expiresAt: Date;
    revokedAt: Date | null;
};

export class MssqlSessionStore implements SessionStore {
    constructor(
        private readonly database: MssqlDatabase,
        private readonly connectionName: string,
    ) { }

    async create(session: AuthSessionRecord): Promise<void> {
        if (!session.userId.trim() || session.userId.length > 200) {
            throw new Error('Session userId must contain 1-200 characters');
        }

        const refreshTokenHash = this.toHashBuffer(session.refreshTokenHash);

        await this.database.withRequest(
            this.connectionName,
            async (request) => {
                await request
                    .input('id', sql.UniqueIdentifier, session.id)
                    .input('userId', sql.NVarChar(200), session.userId)
                    .input('refreshTokenHash', sql.VarBinary(32), refreshTokenHash)
                    .input('expiresAt', sql.DateTime2(3), session.expiresAt)
                    .input('revokedAt', sql.DateTime2(3), session.revokedAt)
                    .query(`
                        INSERT INTO dbo.auth_sessions (session_id, user_id, refresh_token_hash, expires_at, revoked_at)
                        VALUES (@id, @userId, @refreshTokenHash, @expiresAt, @revokedAt);
                    `);
            },
        );
    }

    async findById(id: string): Promise<AuthSessionRecord | null> {
        return this.database.withRequest(
            this.connectionName,
            async (request) => {
                const result = await request
                    .input('id', sql.UniqueIdentifier, id)
                    .query<SessionRow>(`
                        SELECT
                            session_id AS id,
                            user_id AS userId,
                            refresh_token_hash AS refreshTokenHash,
                            expires_at AS expiresAt,
                            revoked_at AS revokedAt
                        FROM dbo.auth_sessions
                        WHERE session_id = @id;
                    `);

                const row = result.recordset[0];

                if (!row) {
                    return null;
                }

                return {
                    id: row.id.toLowerCase(),
                    userId: row.userId,
                    refreshTokenHash: row.refreshTokenHash.toString('hex'),
                    expiresAt: row.expiresAt,
                    revokedAt: row.revokedAt,
                };
            },
        );
    }

    async rotateRefreshToken(
        id: string,
        expectedHash: string,
        nextHash: string,
        now: Date,
    ): Promise<boolean> {
        const expectedHashBuffer = this.toHashBuffer(expectedHash);
        const nextHashBuffer = this.toHashBuffer(nextHash);

        return this.database.withRequest(
            this.connectionName,
            async (request) => {
                const result = await request
                    .input('id', sql.UniqueIdentifier, id)
                    .input('expectedHash', sql.VarBinary(32), expectedHashBuffer,)
                    .input('nextHash', sql.VarBinary(32), nextHashBuffer)
                    .input('now', sql.DateTime2(3), now)
                    .query<{ id: string }>(`
                        DECLARE @rotated TABLE (
                        id UNIQUEIDENTIFIER NOT NULL
                        );

                        UPDATE dbo.auth_sessions
                        SET refresh_token_hash = @nextHash
                        OUTPUT inserted.session_id INTO @rotated (id)
                        WHERE session_id = @id
                        AND refresh_token_hash = @expectedHash
                        AND revoked_at IS NULL
                        AND expires_at > @now;

                        SELECT id FROM @rotated;
                    `);

                return result.recordset.length === 1;
            },
        );
    }

    async revoke(id: string, now: Date): Promise<void> {
        await this.database.withRequest(
            this.connectionName,
            async (request) => {
                await request
                    .input('id', sql.UniqueIdentifier, id)
                    .input('now', sql.DateTime2(3), now)
                    .query(`
                        UPDATE dbo.auth_sessions
                        SET revoked_at = @now
                        WHERE session_id = @id
                          AND revoked_at IS NULL;
                    `);
            }
        )
    }

    private toHashBuffer(hash: string): Buffer {
        if (!/^[0-9a-f]{64}$/i.test(hash)) {
            throw new Error('Refresh token hash must be SHA-256 hex');
        }

        return Buffer.from(hash, 'hex');
    }
}