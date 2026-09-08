import * as dns from 'dns';
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

import { ExpressAdapter } from '@nestjs/platform-express';
import * as express from 'express';

let cachedServer: any = null;

export function setupApp(app: INestApplication) {
  // تمكين CORS لجميع تطبيقات الويب والموبايل
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // تفعيل التحقق التلقائي من المدخلات (Validation Pipes)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // إعداد توثيق Swagger التفاعلي للـ API
  const config = new DocumentBuilder()
    .setTitle('Zorar Code - EduZorar API')
    .setDescription('التوثيق الرسمي والشامل لخدمات منصة زرار كود لإدارة السناتر التعليمية والعيادات الطبية')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
}

export async function createServer(): Promise<any> {
  if (!cachedServer) {
    const expressApp = (express as any).default ? (express as any).default() : (express as any)();
    const adapter = new ExpressAdapter(expressApp);
    const app = await NestFactory.create(AppModule, adapter);
    setupApp(app);
    await app.init();
    cachedServer = expressApp;
  }
  return cachedServer;
}

// Vercel Serverless Function Default Export
export default async function handler(req: any, res: any) {
  const server = await createServer();
  return server(req, res);
}

// Traditional server bootstrap for local development / Docker
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  setupApp(app);

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`🚀 Zorar Code Server is running on: http://localhost:${port}`);
  console.log(`📚 Swagger API Documentation is available on: http://localhost:${port}/docs`);
}

if (!process.env.VERCEL && require.main === module) {
  bootstrap();
}

export { bootstrap };

