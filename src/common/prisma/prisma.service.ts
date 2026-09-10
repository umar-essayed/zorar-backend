import '../../env-bootstrap';
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const dbUrl = process.env.DATABASE_URL?.trim();

    super({
      datasources: dbUrl
        ? {
            db: {
              url: dbUrl,
            },
          }
        : undefined,
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });

    if (!dbUrl) {
      this.logger.error(
        'CRITICAL: DATABASE_URL environment variable is missing. Please configure DATABASE_URL in Vercel or your .env file.',
      );
    }
  }


  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Prisma connected to database successfully.');
    } catch (error: any) {
      this.logger.warn(`Prisma connection deferred or skipped: ${error.message}`);
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
    } catch {}
  }
}
