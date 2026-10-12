import sql from 'mssql';

import { MssqlDatabase } from '../../../infrastructure/database/mssql/mssql.database';

import type { 
    AuthIdentityReader,
    PasswordAccount,
    PasswordAccountReader,
} from '../application/user-identity.ports';

import type { AuthIdentity } from '../domain/auth-user';

type IdentityRow = {
    id: string;
    username: string;
    displayName: string;
    isActive: boolean;
};

type PasswordAccountRow = IdentityRow & {
    passwordHash: string;
}

export class MssqlUserIdentityReader implements PasswordAccountReader, AuthIdentityReader {
    constructor(
        private readonly database: MssqlDatabase,
        private readonly connectionName: string,
    ) {}

    async findByUsername(username: string,): Promise<PasswordAccount | null> {
        return this.database.withRequest(
            this.connectionName,
            async (request) => {
                const result = await request
                    .input('username', sql.VarChar(100), username)
                    .query<PasswordAccountRow>(`
                        SELECT 
                            user_id AS id,
                            username,
                            display_name AS displayName, 
                            is_active AS isActive,
                            password_hash AS passwordHash
                        FROM dbo.auth_users
                        WHERE username = @username;    
                    `);

                const row = result.recordset[0];
                
                if(!row) {
                    return null;
                }

                return { 
                    identity: this.toIdentity(row),
                    passwordHash: row.passwordHash,
                }
            }
        )
    }

    async findById(userId: string,): Promise<AuthIdentity | null> {
        return this.database.withRequest(
            this.connectionName,
            async (request) => {
                const result = await request
                    .input('userId', sql.UniqueIdentifier, userId)
                    .query<IdentityRow>(`
                        SELECT 
                            user_id AS id,
                            username,
                            display_name AS displayName,
                            is_active AS isActive
                        FROM dbo.auth_users
                        WHERE user_id = @userId;    
                    `);

                const row = result.recordset[0];

                return row ? this.toIdentity(row) : null;
            }
        )
    }

    private toIdentity(row: IdentityRow): AuthIdentity {
        return {
            id: row.id.toLowerCase(),
            username: row.username, 
            displayName: row.displayName,
            isActive: row.isActive,

            roles: [],
            permissions: [],
        }
    }
}