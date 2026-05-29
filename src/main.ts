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

  app.enableCors({
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:4200',
    ],
    methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization',
    credentials: true,
  });

   app.use((_req: any, res: any, next: any) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
    next();
  });


  await app.listen(3000);
  logger.log('🚀 Servidor corriendo en http://localhost:3000');
}

bootstrap().catch((err) => {
  console.error('💥 Error fatal en bootstrap:', err);
  process.exit(1);
});