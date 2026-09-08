import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateBrandingDto, RechargeQuotaDto } from './dto/update-branding.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { UserRole } from '@prisma/client';

@Controller('api/v1/tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Post()
  createTenant(@Body() dto: CreateTenantDto) {
    return this.tenantService.createTenant(dto);
  }

  @Get('by-subdomain/:subdomain')
  getBySubdomain(@Param('subdomain') subdomain: string) {
    return this.tenantService.getTenantBySubdomain(subdomain);
  }

  @Get('current')
  @UseGuards(JwtAuthGuard)
  getCurrentTenant(@CurrentTenant() tenantId: string) {
    return this.tenantService.getTenantById(tenantId);
  }

  @Put('branding')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN)
  updateBranding(
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateBrandingDto,
  ) {
    return this.tenantService.updateBranding(tenantId, dto);
  }

  @Put('plan')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN)
  updatePlan(
    @CurrentTenant() tenantId: string,
    @Body('plan') plan: any,
  ) {
    return this.tenantService.updatePlan(tenantId, plan);
  }

  @Post('recharge-quota')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  rechargeQuota(@Body() dto: RechargeQuotaDto) {
    return this.tenantService.rechargeQuota(dto);
  }

  @Get('quota-history')
  @UseGuards(JwtAuthGuard)
  getQuotaHistory(@CurrentTenant() tenantId: string) {
    return this.tenantService.getQuotaHistory(tenantId);
  }

  // ===========================================================================
  // المساعدين وفريق العمل (Staff & Assistants)
  // ===========================================================================

  @Get('staff')
  @UseGuards(JwtAuthGuard)
  getStaff(@CurrentTenant() tenantId: string) {
    return this.tenantService.getStaff(tenantId);
  }

  @Post('staff')
  @UseGuards(JwtAuthGuard)
  createStaff(@CurrentTenant() tenantId: string, @Body() body: any) {
    return this.tenantService.createStaff(tenantId, body);
  }

  @Put('staff/:id')
  @UseGuards(JwtAuthGuard)
  updateStaff(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.tenantService.updateStaff(tenantId, id, body);
  }

  @Delete('staff/:id')
  @UseGuards(JwtAuthGuard)
  deleteStaff(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.tenantService.deleteStaff(tenantId, id);
  }
}
