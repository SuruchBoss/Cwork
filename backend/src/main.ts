import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { APP_CONFIG } from './core/config/config.token';
import type { RootConfig } from './core/config/configuration';
import { PrismaService } from './core/prisma/prisma.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get<RootConfig>(APP_CONFIG);

  // Trust the first proxy hop so `req.ip` (rate limiting, audit) is the real
  // client address behind a load balancer, without trusting arbitrary hops.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: config.app.isProduction ? undefined : false,
      crossOriginEmbedderPolicy: false,
      hsts: config.app.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );
  app.use(compression());

  app.enableCors({
    origin: config.app.corsOrigins.length > 0 ? config.app.corsOrigins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'Idempotency-Key'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86_400,
  });

  app.setGlobalPrefix(config.app.apiPrefix, {
    exclude: ['health/live', 'health/ready'],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      // Strip unknown keys and reject them outright: mass-assignment is the
      // easiest way to sneak `role` or `organizationId` into a payload.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
    }),
  );

  if (!config.app.isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Cwork API')
      .setDescription(
        'Open-source HRIS: people, recruitment, leave, attendance, payroll and an HR assistant.',
      )
      .setVersion('0.1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${config.app.apiPrefix}/docs`, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  app.enableShutdownHooks();
  app.get(PrismaService).enableShutdownHooks(app);

  await app.listen(config.app.port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`Cwork API listening on :${config.app.port} (${config.app.env})`);
}

void bootstrap();
