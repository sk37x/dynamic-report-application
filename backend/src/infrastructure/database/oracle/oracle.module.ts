import { 
    Module,
    type DynamicModule,
    type FactoryProvider,
    type ModuleMetadata,
} from '@nestjs/common';
import { OracleDatabase } from './oracle.database';
import type { OracleModuleOptions } from './oracle.types';

const ORACLE_OPTIONS = Symbol('ORACLE_OPTIONS');

type OracleModuleAsyncOptions = Pick<ModuleMetadata, 'imports'> & Pick<FactoryProvider<OracleModuleOptions>, 'inject' | 'useFactory'>;

@Module({})
export class OracleModule { 
    static registerAsync(
        options: OracleModuleAsyncOptions,
    ): DynamicModule {
        return { 
            module: OracleModule,

            // เมื่อลงทะเบียนแล้ว feature ต่าง ๆ สามารถ inject service นี้ได้
            global: true,

            imports: options.imports ?? [],

            providers: [
                {
                    provide: ORACLE_OPTIONS,
                    inject: options.inject ?? [],
                    useFactory: options.useFactory,
                },
                {
                    provide: OracleDatabase,
                    inject: [ORACLE_OPTIONS],
                    useFactory: (config: OracleModuleOptions) => new OracleDatabase(config),
                },
            ],

            exports: [OracleDatabase],
        }
    }
}