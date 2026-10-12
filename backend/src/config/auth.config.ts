type MssqlAuthScource = {
    kind: 'mssql',
    connectionName: string;
}

export type AuthConfig = 
    | {
        enabled: false;
    }
    | {
        enabled: true;
        credentials: MssqlAuthScource;
        sessionStore: MssqlAuthScource;
    };

export const authConfig: AuthConfig = {
    enabled: true,

    credentials: {
        kind: 'mssql',
        connectionName: 'MAIN',
    },

    sessionStore: {
        kind: 'mssql',
        connectionName: 'MAIN',
    }
}