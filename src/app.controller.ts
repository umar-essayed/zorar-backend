import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('System')
@Controller()
export class AppController {
  @Get()
  @ApiOperation({ summary: 'الصفحة الرئيسية وحالة الخادم السيرفرليس' })
  getRoot() {
    return {
      name: 'Zorar Code Enterprise API',
      version: '1.0.0',
      runtime: 'Vercel Serverless Function',
      status: 'online',
      documentation: '/docs',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health')
  @ApiOperation({ summary: 'فحص جاهزية الخادم (Healthcheck)' })
  getHealth() {
    return {
      status: 'healthy',
      uptime: process.uptime(),
      serverless: true,
      timestamp: new Date().toISOString(),
    };
  }
}
