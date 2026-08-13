// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  process.on('unhandledRejection', (reason) => {
    logger.error(`💥 unhandledRejection: ${reason}`);
    console.error(reason);
  });

  process.on('uncaughtException', (err) => {
    logger.error(`💥 uncaughtException: ${err.message}`);
    console.error(err);
  });

  const app = await NestFactory.create(AppModule, {
    abortOnError: false,
  });

  const allowedOrigins = process.env.FRONTEND_URL
    ? [process.env.FRONTEND_URL, 'https://agrosmart-backend-6xug.onrender.com']
    : [
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:4200',
      ];

  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization',
    credentials: true,
  });

  app.use((_req: any, res: any, next: any) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
    next();
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`🚀 Servidor corriendo en el puerto ${port}`);
}

bootstrap().catch((err) => {
  console.error('💥 Error fatal en bootstrap:', err);
  process.exit(1);
});
