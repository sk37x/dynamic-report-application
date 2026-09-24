import { 
    Module,
    type DynamicModule, 
    type FactoryProvider,
    type ModuleMetadata,
} from '@nestjs/common';
import { MssqlDatabase } from './mssql.database';
import type { MssqlModuleOptions } from './mssql.types';

const MSSQL_OPTIONS = Symbol('MSSQL_OPTIONS');

type MssqlModuleAsyncOptions = 
    Pick<ModuleMetadata, 'imports'> &
    Pick<FactoryProvider<MssqlModuleOptions>, 'inject' | 'useFactory'>;

@Module({})
export class MssqlModule {
    static registerAsync(
        options: MssqlModuleAsyncOptions,
    ): DynamicModule {
        return {
            module: MssqlModule,
            global: true,
            imports: options.imports ?? [],

            providers: [
                {
                    provide: MSSQL_OPTIONS,
                    inject: options.inject ?? [],
                    useFactory: options.useFactory,
                },
                {
                    provide: MssqlDatabase,
                    inject: [MSSQL_OPTIONS],
                    useFactory: (config: MssqlModuleOptions) => new MssqlDatabase(config),
                },
            ],

            exports: [MssqlDatabase],
        };
    }
}