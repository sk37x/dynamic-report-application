import { describe, expect, it } from 'vitest'

import { ScryptPasswordHasher } from './scrypt-password.hasher'

describe('ScryptPasswordHasher', () => {
    const hasher = new ScryptPasswordHasher();

    it('ตรวจรหัสผ่านถูก/ผิด และรักษาช่องว่างของ password', async() => {
        const password = ' My test password ภาษาไทย ';
        const hash = await hasher.hash(password);

        expect(hash).not.toContain(password);

        await expect(hasher.verify(password, hash),).resolves.toBe(true);

        await expect(hasher.verify(password.trim(), hash)).resolves.toBe(false);
    })

    it('รหัสผ่านเดียวกัน hash ต่างกันเพราะ salt สุ่ม', async () => {
        const password = 'Another test password';

        const first = await hasher.hash(password);
        const second = await hasher.hash(password);

        expect(first).not.toBe(second);

        await expect(hasher.verify(password, second)).resolves.toBe(true);
    });

    it('แจ้ง error เมื่อรูปแบบ hash ไม่ถูกต้อง', async () => {
        await expect(hasher.verify('Test password', 'invalid-hash'),).rejects.toThrow('Unsupported or malformed password hash');
    })

    it('ไม่รับ password เกินขีดจำกัด', async () => {
        await expect(hasher.hash('a'.repeat(1025))).rejects.toThrow('Password must contain');
    })
})