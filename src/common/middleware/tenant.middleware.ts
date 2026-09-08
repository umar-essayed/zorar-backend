import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(private prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const host = req.headers.host || '';
    const tenantHeader = req.headers['x-tenant-id'] as string;
    const baseDomain = process.env.PLATFORM_BASE_DOMAIN || 'eduzorar.com';

    let tenant = null;

    try {
      if (tenantHeader) {
        tenant = await this.prisma.tenant.findUnique({
          where: { id: tenantHeader },
        });
      } else if (host.includes(baseDomain)) {
        // استخراج الـ Subdomain (مثال: center.eduzorar.com)
        const parts = host.split('.');
        if (parts.length > 2 && parts[0] !== 'api' && parts[0] !== 'www') {
          const subdomain = parts[0];
          tenant = await this.prisma.tenant.findUnique({
            where: { subdomain },
          });
        }
      } else if (
        host &&
        !host.includes('localhost') &&
        !host.includes('127.0.0.1') &&
        !host.includes('vercel.app')
      ) {
        // فحص النطاق المخصص Custom Domain (مثال: mr-ahmed.com)
        tenant = await this.prisma.tenant.findUnique({
          where: { customDomain: host },
        });
      }
    } catch (error: any) {
      this.logger.warn(`Tenant resolution bypassed: ${error.message}`);
    }

    if (tenant) {
      (req as any).tenant = tenant;
    }

    next();
  }
}
