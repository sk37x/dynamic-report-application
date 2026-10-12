import type {
    CredentialVerifier,
    LoginInput,
} from './auth.ports';

import type {
    PasswordAccountReader,
    PasswordHasher,
} from './user-identity.ports';

import type { AuthIdentity } from '../domain/auth-user';

export class PasswordCredentialVerifier implements CredentialVerifier {
    constructor(
        private readonly accounts: PasswordAccountReader,
        private readonly passwords: PasswordHasher,
        private readonly dummyPasswordHash: string,
    ) {}

    async verify(input: LoginInput): Promise<AuthIdentity | null> {
        const username = input.username.trim().toLowerCase();
        const passwordBytes = Buffer.byteLength(input.password, 'utf-8');

        if(
            !/^[a-z0-9._@+-]{1,100}$/.test(username)
            || passwordBytes === 0
            || passwordBytes > 1024
        ) {
            return null;
        }

        const account = await this.accounts.findByUsername(username);

        const matched = await this.passwords.verify(input.password, account?.passwordHash ?? this.dummyPasswordHash);

        if(!account || !matched || !account.identity.isActive) {
            return null;
        }

        const identity = account.identity;
        
        return { 
            id: identity.id,
            username: identity.username,
            displayName: identity.displayName,
            isActive: identity.isActive,
            roles: [...identity.roles],
            permissions: [...identity.permissions],
        }
    }
}