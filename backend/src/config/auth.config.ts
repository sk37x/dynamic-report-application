import type { AuthDatabaseSource } from './auth-database.types';

export type AuthConfig = 
    | {
        enabled: false;
    }
    | {
        enabled: true;
        credentials: AuthDatabaseSource;
        sessionStore: AuthDatabaseSource;
    };

export const authConfig: AuthConfig = {
    enabled: false,
    // credentials: {
    //     kind: 'oracle',
    //     connectionName: 'MAIN',
    // },
    // sessionStore: {
    //     kind: 'oracle',
    //     connectionName: 'MAIN',
    // },
}