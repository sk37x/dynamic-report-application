import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure-app'

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  configureApp(app);
  app.enableShutdownHooks();

  const config = app.get(ConfigService);

  const port = config.getOrThrow<number>("PORT");
  const host = config.getOrThrow<string>("HOST");
  
  await app.listen(port, host);

  Logger.log(
    `API listening at http://${host}:${port}/api`,
    `Bootstrap`
  )
}

// await bootstrap();
bootstrap().catch((error: unknown) => {
  Logger.error(error, undefined, 'Bootstrap');
  process.exitCode = 1;
})
