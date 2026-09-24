import type { AuthIdentity } from "../domain/auth-user";

export type LoginInput = {
    username: string;
    password: string;
};

export interface CredentialVerifier {
    /**
     * credentials ถูกต้อง: คืนข้อมูลผู้ใช้
     * credentials ไม่ถูกต้อง: คืน null
     * ระบบตรวจผู้ใช้ล่ม: throw error
     *
     * ไม่คืน password หรือ password hash
     */
    verify(input: LoginInput): Promise<AuthIdentity | null>;
}

export type IssuedSession = {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: Date;
    refreshTokenExpiresAt: Date;
};

export interface SessionIssuer {
    /**
     * สร้าง session ให้ผู้ใช้ที่ตรวจผ่านแล้ว
     * หากสร้างไม่สำเร็จต้อง throw error
     */
    issue(userId: string): Promise<IssuedSession>;
}

