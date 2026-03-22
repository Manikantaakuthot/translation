import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import helmet from 'helmet';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const compression = require('compression');

async function bootstrap() {
  const uploadsDir = join(__dirname, '..', 'uploads');
  if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(compression());
  // Set global prefix BEFORE static assets so API routes take priority
  app.setGlobalPrefix('api');
  app.useStaticAssets(uploadsDir, { prefix: '/uploads/' });
  app.useWebSocketAdapter(new IoAdapter(app));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || true,
    credentials: true,
  });
  // Serve production web build AFTER all API routes are registered
  const webDist = join(__dirname, '..', '..', 'web', 'dist');
  if (existsSync(webDist)) {
    app.useStaticAssets(webDist);
  }
  await app.listen(process.env.PORT || 3000, '0.0.0.0');
  // Register SPA fallback AFTER NestJS routes so /api/* is not intercepted
  if (existsSync(webDist)) {
    const server = app.getHttpAdapter().getInstance() as any;
    server.get(/^(?!\/api\/).*/, (_req: any, res: any) =>
      res.sendFile(join(webDist, 'index.html')),
    );
  }
  console.log(`🚀 API running on http://localhost:${process.env.PORT || 3000}`);
}
bootstrap();
