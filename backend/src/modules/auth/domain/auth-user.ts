// ข้อมูลส่งกลับไปที่ frontend
export type AuthUser = {
    id: string;
    username: string;
    displayName: string;
    roles: string[];
    permissions: string[];
}

// ข้อมูลภายในที่ได้หลังตรวจ credentials
export type AuthIdentity = AuthUser & {
    isActive:boolean;
};