import type { AuthUser } from '../domain/auth-user';
import { InvalidCredentialsError } from '../domain/invalid-credentials.error';

import type { 
    CredentialVerifier,
    IssuedSession,
    LoginInput,
    SessionIssuer
} from './auth.ports';

export type LoginResult = {
    user: AuthUser;

    // ใช้ภายใน backend สำหรับตั้ง cookie
    session: IssuedSession;
};

export class LoginUseCase {
    constructor(
        private readonly credentialVerifier: CredentialVerifier,
        private readonly sessionIssuer: SessionIssuer,
    ) {}

    async execute(input: LoginInput): Promise<LoginResult> {
        const username = input.username.trim();

        // ห้าม trim password เพราะช่างว่างอาจเป็นส่วนหนึ่งของรหัสผ่าน
        const password = input.password;

        if(!username || password.length === 0) {
            throw new InvalidCredentialsError();
        }

        const identity = await this.credentialVerifier.verify({username, password});

        if(!identity || !identity.isActive) {
            throw new InvalidCredentialsError();
        }

        // เลือกเฉพาะ field ที่อนุญาต
        // ไม่ spread identity ทั้ง object 
        const user: AuthUser = {
            id: identity.id,
            username: identity.username,
            displayName: identity.displayName,
            roles: [...identity.roles],
            permissions: [...identity.permissions],
        };

        const session = await this.sessionIssuer.issue(user.id);

        return {
            user,
            session,
        }
    }
}