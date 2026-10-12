export type AuthSessionRecord = {
    id: string;
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    revokedAt: Date | null;
};

export interface SessionStore {
    /**
     * ต้องสร้าง record ใหม่เท่านั้น 
     * หาก id ซ้ำให้ throw ไม่เขียนทับ
     */
    create(session: AuthSessionRecord): Promise<void>;

    findById(id: string): Promise<AuthSessionRecord | null>;

    /**
     * ต้องตรวจและอัปเดตแบบ atomic:
     * - session ยังไม่ถูก revoke
     * - session ยังไม่หมดอายุ
     * - hash ปัจจุบันตรงกับ expectedHash
     * 
     * อัปเดตได้ = true
     * ไม่เข้าเงื่อนไข = false
     * storage ล่ม = throw
     */
    rotateRefreshToken(
        id: string,
        expectedHash: string,
        nextHash: string,
        now: Date,
    ): Promise<boolean>;

    /**
     * เรียกซ้ำได้ ไม่ต้อง error ถ้า session ถูก revoke ไปแล้ว
     */
    revoke(id: string, now: Date): Promise<void>;
}