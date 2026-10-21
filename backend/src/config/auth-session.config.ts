import type { AuthDatabaseSource } from './auth-database.types';

export type AuthSessionConfig =
    | {
        enabled: false;
    }
    | {
        enabled: true;
        store: AuthDatabaseSource;
    };

export const authSessionConfig: AuthSessionConfig = {
    enabled: false,
    // store: {
    //     kind: 'oracle',
    //     connectionName: 'MAIN',
    // },


}