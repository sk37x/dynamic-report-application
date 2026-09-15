import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';

export function configureApp(app: INestApplication): void {
    const config = app.get(ConfigService);

    app.setGlobalPrefix('api');

    app.enableCors({
        origin: config.getOrThrow<string>('CORS_ORIGIN'),
        credentials: true,
    })

    app.use(cookieParser());

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );
};