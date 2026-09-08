import { Module } from '@nestjs/common';
import { StorefrontService } from './storefront.service';
import { StorefrontController } from './storefront.controller';

@Module({
  controllers: [StorefrontController],
  providers: [StorefrontService],
  exports: [StorefrontService],
})
export class StorefrontModule {}
