import oracledb from 'oracledb';

import { OracleDatabase } from '../../../infrastructure/database/oracle/oracle.database';

import type {
  AuthSessionRecord,
  SessionStore,
} from '../application/session.store';

type SessionRow = {
  SESSION_ID: string;
  USER_ID: string;
  REFRESH_TOKEN_HASH: Buffer;
  EXPIRES_AT_MS: number;
  REVOKED_AT_MS: number | null;
};

export class OracleSessionStore implements SessionStore {
  constructor(
    private readonly database: OracleDatabase,
    private readonly connectionName: string,
  ) {}

  async create(session: AuthSessionRecord): Promise<void> {
    if (!session.userId.trim() || session.userId.length > 200) {
      throw new Error('Session userId must contain 1–200 characters');
    }

    const hash = this.toHashBuffer(session.refreshTokenHash);

    await this.database.withConnection(
      this.connectionName,
      async (connection) => {
        await connection.execute(
          `
            INSERT INTO AUTH_SESSIONS (
              SESSION_ID,
              USER_ID,
              REFRESH_TOKEN_HASH,
              EXPIRES_AT_MS,
              REVOKED_AT_MS
            )
            VALUES (
              :id,
              :userId,
              :refreshHash,
              :expiresAt,
              :revokedAt
            )
          `,
          {
            id: session.id,

            userId: {
              val: session.userId,
              type: oracledb.DB_TYPE_NVARCHAR,
            },

            refreshHash: hash,
            expiresAt: session.expiresAt.getTime(),

            revokedAt: {
              val: session.revokedAt?.getTime() ?? null,
              type: oracledb.NUMBER,
            },
          },
          {
            autoCommit: true,
          },
        );
      },
    );
  }

  async findById(id: string): Promise<AuthSessionRecord | null> {
    return this.database.withConnection(
      this.connectionName,
      async (connection) => {
        const result = await connection.execute<SessionRow>(
          `
            SELECT
              SESSION_ID,
              USER_ID,
              REFRESH_TOKEN_HASH,
              EXPIRES_AT_MS,
              REVOKED_AT_MS
            FROM AUTH_SESSIONS
            WHERE SESSION_ID = :id
          `,
          { id },
          {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
          },
        );

        const row = result.rows?.[0];

        if (!row) {
          return null;
        }

        return {
          id: row.SESSION_ID,
          userId: row.USER_ID,
          refreshTokenHash: row.REFRESH_TOKEN_HASH.toString('hex'),
          expiresAt: new Date(row.EXPIRES_AT_MS),

          revokedAt: row.REVOKED_AT_MS === null
            ? null
            : new Date(row.REVOKED_AT_MS),
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
    const expected = this.toHashBuffer(expectedHash);
    const next = this.toHashBuffer(nextHash);

    return this.database.withConnection(
      this.connectionName,
      async (connection) => {
        const result = await connection.execute(
          `
            UPDATE AUTH_SESSIONS
            SET REFRESH_TOKEN_HASH = :nextHash
            WHERE SESSION_ID = :id
              AND REFRESH_TOKEN_HASH = :expectedHash
              AND REVOKED_AT_MS IS NULL
              AND EXPIRES_AT_MS > :nowMs
          `,
          {
            id,
            expectedHash: expected,
            nextHash: next,
            nowMs: now.getTime(),
          },
          {
            autoCommit: true,
          },
        );

        return result.rowsAffected === 1;
      },
    );
  }

  async revoke(id: string, now: Date): Promise<void> {
    await this.database.withConnection(
      this.connectionName,
      async (connection) => {
        await connection.execute(
          `
            UPDATE AUTH_SESSIONS
            SET REVOKED_AT_MS = :nowMs
            WHERE SESSION_ID = :id
              AND REVOKED_AT_MS IS NULL
          `,
          {
            id,
            nowMs: now.getTime(),
          },
          {
            autoCommit: true,
          },
        );
      },
    );
  }

  private toHashBuffer(hash: string): Buffer {
    if (!/^[0-9a-f]{64}$/i.test(hash)) {
      throw new Error('Refresh token hash must be SHA-256 hex');
    }

    return Buffer.from(hash, 'hex');
  }
}