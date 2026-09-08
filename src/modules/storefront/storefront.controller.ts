import { Controller, Get, Put, Body, Param, UseGuards } from '@nestjs/common';
import { StorefrontService } from './storefront.service';
import { UpdateStorefrontDto } from './dto/update-storefront.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@Controller('api/v1/storefront')
export class StorefrontController {
  constructor(private readonly storefrontService: StorefrontService) {}

  @Put('config')
  @UseGuards(JwtAuthGuard)
  updateConfig(@CurrentTenant() tenantId: string, @Body() dto: UpdateStorefrontDto) {
    return this.storefrontService.updateStorefront(tenantId, dto);
  }

  // نقطة عامة لمتصفحات الويب والـ SSR في Next.js
  @Get('public/:host')
  getPublicStorefront(@Param('host') host: string) {
    return this.storefrontService.getPublicStorefront(host);
  }
}
