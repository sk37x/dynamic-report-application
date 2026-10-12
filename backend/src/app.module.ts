import { Module } from '@nestjs/common';;
import { ConfigModule } from '@nestjs/config';
import { envValidationSchema } from './config/env.validation';
import { HealthModule } from './modules/health/health.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { authSessionConfig } from './config/auth-session.config';
import { AuthSessionModule } from './modules/auth/auth-session.module';

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

    AuthSessionModule.register(authSessionConfig),
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
