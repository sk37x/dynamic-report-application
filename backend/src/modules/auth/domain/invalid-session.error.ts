export class InvalidSessionError extends Error {
    constructor() {
        super('Session ไม่ถูฏต้องหรือหมดอายุแล้ว');

        this.name = 'InvalidSessionError';
    }
}