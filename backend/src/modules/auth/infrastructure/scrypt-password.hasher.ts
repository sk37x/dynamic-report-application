import { 
    randomBytes,
    scrypt,
    timingSafeEqual,
} from 'node:crypto';

import type { PasswordHasher } from '../application/user-identity.ports';

export class ScryptPasswordHasher implements PasswordHasher {
    async hash(password: string): Promise<string> {
        this.validatePassword(password);

        const salt = randomBytes(16);
        const derivedKey = await this.derive(password, salt);

        return [
            'scrypt-v1',
            salt.toString('hex'),
            derivedKey.toString('hex'),
        ].join('$');
    }

    async verify(password: string, encodedHash: string): Promise<boolean> {
        this.validatePassword(password);

        const match = /^scrypt-v1\$([0-9a-f]{32})\$([0-9a-f]{128})$/.exec(encodedHash);

        if(!match) {
            throw new Error('Unsupported or malformed password hash');
        }

        const salt = Buffer.from(match[1], 'hex');
        const expectedKey = Buffer.from(match[2], 'hex');

        const actualKey = await this.derive(password, salt);

        return timingSafeEqual(actualKey, expectedKey);
    }

    private validatePassword(password: string): void {
        const bytes = Buffer.byteLength(password, 'utf-8');

        if(bytes === 0 || bytes > 1024) {
            throw new Error('Password must contain 1-1024 UTF-8 bytes');
        }
    }

    private derive(password: string, salt: Buffer,): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            scrypt(
                password,
                salt,
                64,
                {
                    N: 32768,
                    r: 8,
                    p: 3,
                    maxmem: 64 * 1024 * 1024,
                },
                (error, derivedKey) => {
                    if(error) {
                        reject(error);
                        return;
                    }

                    resolve(derivedKey);
                },
            );
        });
    }
}