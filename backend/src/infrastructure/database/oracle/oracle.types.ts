export type OracleConnectionOptions = {
    name: string;
    user: string; 
    password: string;
    connectString: string;

    poolMin?: number;
    poolMax?: number
};

export type OracleModuleOptions = {
    /**
     * Windows: path ของ Instant Client 19c
     * Linux: ตั้ง libraty search path ของระบบแล้วไม่ต้องระบุค่านี้
     */

    clientLibDir?: string;

    connections: OracleConnectionOptions[];
};

