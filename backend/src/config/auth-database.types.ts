export type AuthDatabaseSource = {
  kind: 'oracle' | 'mssql';
  connectionName: string;
};