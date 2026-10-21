import oracledb from 'oracledb';

import { OracleDatabase } from '../../../infrastructure/database/oracle/oracle.database';

import type {
  AuthIdentityReader,
  PasswordAccount,
  PasswordAccountReader,
} from '../application/user-identity.ports';

import type { AuthIdentity } from '../domain/auth-user';

type IdentityRow = {
  USER_ID: string;
  USERNAME: string;
  DISPLAY_NAME: string;
  IS_ACTIVE: number;
};

type PasswordRow = IdentityRow & {
  PASSWORD_HASH: string;
};

export class OracleUserIdentityReader
  implements PasswordAccountReader, AuthIdentityReader
{
  constructor(
    private readonly database: OracleDatabase,
    private readonly connectionName: string,
  ) {}

  async findByUsername(
    username: string,
  ): Promise<PasswordAccount | null> {
    return this.database.withConnection(
      this.connectionName,
      async (connection) => {
        const result = await connection.execute<PasswordRow>(
          `
            SELECT
              USER_ID,
              USERNAME,
              DISPLAY_NAME,
              IS_ACTIVE,
              PASSWORD_HASH
            FROM AUTH_USERS
            WHERE USERNAME = :username
          `,
          { username },
          {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
          },
        );

        const row = result.rows?.[0];

        if (!row) {
          return null;
        }

        return {
          identity: this.toIdentity(row),
          passwordHash: row.PASSWORD_HASH,
        };
      },
    );
  }

  async findById(userId: string): Promise<AuthIdentity | null> {
    return this.database.withConnection(
      this.connectionName,
      async (connection) => {
        const result = await connection.execute<IdentityRow>(
          `
            SELECT
              USER_ID,
              USERNAME,
              DISPLAY_NAME,
              IS_ACTIVE
            FROM AUTH_USERS
            WHERE USER_ID = :userId
          `,
          { userId },
          {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
          },
        );

        const row = result.rows?.[0];

        return row ? this.toIdentity(row) : null;
      },
    );
  }

  private toIdentity(row: IdentityRow): AuthIdentity {
    return {
      id: row.USER_ID,
      username: row.USERNAME,
      displayName: row.DISPLAY_NAME,
      isActive: row.IS_ACTIVE === 1,
      roles: [],
      permissions: [],
    };
  }
}