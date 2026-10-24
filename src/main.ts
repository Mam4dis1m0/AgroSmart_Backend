// src/main.ts
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
// ...resto de imports
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { tenantMiddleware } from './auth/tenant-context';
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

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: false,
  });

  // Las fotos viajan en base64 dentro del JSON (perfil y marketplace). El límite por defecto de
  // Express es 100 KB y responde 413 a cualquier foto normal; el DTO ya acepta hasta ~6 MB.
  app.useBodyParser('json', { limit: '12mb' });
  app.useBodyParser('urlencoded', { limit: '12mb', extended: true });

  // Contexto por petición (usuario + finca activa). OBLIGATORIO: sin esto el AuthGuard
  // no puede aislar los datos por finca y rechaza la petición.
  app.use(tenantMiddleware);

  const extraOrigins = process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [];

  app.enableCors({
    origin: (origin, callback) => {
      const isBrowserlessRequest = !origin;
      const isLocalhost = origin && /^http:\/\/localhost:\d+$/.test(origin);
      const isAllowedExtra = origin && extraOrigins.includes(origin);

      if (isBrowserlessRequest || isLocalhost || isAllowedExtra) {
        callback(null, true);
      } else {
        callback(new Error('No permitido por CORS'));
      }
    },
    methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization',
    credentials: true,
  });

  app.use((_req: any, res: any, next: any) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
    next();
  });

  const config = new DocumentBuilder()
  .setTitle('AgroSmart API')
  .setDescription('API de gestión agrícola')
  .setVersion('1.0')
  .addBearerAuth()
  .build();
const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('api', app, document);
  
  
  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`🚀 Servidor corriendo en el puerto ${port}`);
}

bootstrap().catch((err) => {
  console.error('💥 Error fatal en bootstrap:', err);
  process.exit(1);
});