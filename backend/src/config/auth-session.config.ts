export type AuthSessionConfig =
    | {
        enabled: false;
    }
    | {
        enabled: true;
        store: {
            kind: 'mssql';
            connectionName: string;
        };
    };

export const authSessionConfig: AuthSessionConfig = {
    enabled: false
    /**
     *  enabled: true,
     *  store: {
     *      kind: 'mssql',
     *      connectionName: 'MAIN',
     *  }
     * 
    */

}