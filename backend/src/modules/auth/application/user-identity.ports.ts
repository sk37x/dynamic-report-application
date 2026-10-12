import type { AuthIdentity } from "../domain/auth-user";

export type PasswordAccount = {
    identity: AuthIdentity;
    passwordHash: string;
};

export interface PasswordAccountReader {
    findByUsername(username: string): Promise<PasswordAccount | null>;
}

export interface AuthIdentityReader {
    findById(userId: string): Promise<AuthIdentity | null>;
}

export interface PasswordHasher {
    hash(password: string): Promise<string>;

    verify(
        password: string,
        encodedHash: string,
    ): Promise<boolean>;
}