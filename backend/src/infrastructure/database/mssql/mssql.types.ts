export type MssqlConnectionOptions = {
    name: string;

    server: string;
    port?: number;
    database: string;
    user: string;
    password: string;

    poolMin?: number;
    poolMax?: number;

    encrypt?: boolean;

    trustServerCertificate?: boolean;
}

export type MssqlModuleOptions = {
    connections: MssqlConnectionOptions[];
}