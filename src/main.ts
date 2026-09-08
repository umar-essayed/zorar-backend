import * as dns from 'dns';
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

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

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  setupApp(app);

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`🚀 Zorar Code Server is running on: http://localhost:${port}`);
  console.log(`📚 Swagger API Documentation is available on: http://localhost:${port}/docs`);
}

if (require.main === module) {
  bootstrap();
}

export { bootstrap };
