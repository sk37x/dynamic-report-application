import { Module } from '@nestjs/common';;
import { ConfigModule } from '@nestjs/config';
import { envValidationSchema } from './config/env.validation';
import { HealthModule } from './modules/health/health.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { authConfig } from './config/auth.config';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: '.env',
      validationSchema: envValidationSchema,
      validationOptions: {
        libraryOptions: {
          allowUnknown: true,
          abortEarly: false,
        },
      },
    }),
    
    HealthModule,
    DatabaseModule,

    // AuthSessionModule.register(authSessionConfig),
    AuthModule.register(authConfig),
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
