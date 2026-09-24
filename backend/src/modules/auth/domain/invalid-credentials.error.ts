export class InvalidCredentialsError extends Error {
    constructor() {
        super('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');

        this.name = 'InvalidCredentialsError';
    }
}