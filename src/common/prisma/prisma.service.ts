import '../../env-bootstrap';
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const DEFAULT_SUPABASE_DATABASE_URL =
  'postgresql://postgres.ywhgmfpkuymjfalduiqm:ItzVJXLE2n4zldVD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=10';

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
  process.env.DATABASE_URL = DEFAULT_SUPABASE_DATABASE_URL;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const dbUrl =
      process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== ''
        ? process.env.DATABASE_URL.trim()
        : DEFAULT_SUPABASE_DATABASE_URL;

    // Enforce environment variable for Prisma engine internal checks
    process.env.DATABASE_URL = dbUrl;

    super({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
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
