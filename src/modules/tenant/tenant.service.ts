import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateBrandingDto, RechargeQuotaDto } from './dto/update-branding.dto';

@Injectable()
export class TenantService {
  constructor(private prisma: PrismaService) {}

  async createTenant(dto: CreateTenantDto) {
    const existingSubdomain = await this.prisma.tenant.findUnique({
      where: { subdomain: dto.subdomain },
    });
    if (existingSubdomain) {
      throw new ConflictException('النطاق الفرعي محجوز بالفعل لمؤسسة أخرى');
    }

    if (dto.customDomain) {
      const existingDomain = await this.prisma.tenant.findUnique({
        where: { customDomain: dto.customDomain },
      });
      if (existingDomain) {
        throw new ConflictException('النطاق المخصص محجوز بالفعل');
      }
    }

    return this.prisma.tenant.create({
      data: {
        name: dto.name,
        type: dto.type,
        plan: dto.plan || 'STANDARD',
        subdomain: dto.subdomain.toLowerCase(),
        customDomain: dto.customDomain ? dto.customDomain.toLowerCase() : null,
        quotaBalance: 50, // رصيد ترحيبي مبدئي
        brandingConfig: {
          primaryColor: '#2563eb',
          secondaryColor: '#1e40af',
          themeMode: 'light',
          logoUrl: null,
          heroBannerUrl: null,
        },
      },
    });
  }

  async getTenantBySubdomain(subdomain: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { subdomain: subdomain.toLowerCase() },
      select: {
        id: true,
        name: true,
        type: true,
        plan: true,
        subdomain: true,
        customDomain: true,
        brandingConfig: true,
        isActive: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('المؤسسة غير موجودة');
    }
    return tenant;
  }

  async getTenantById(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        storefrontConfig: true,
      },
    });
    if (!tenant) {
      throw new NotFoundException('المؤسسة غير موجودة');
    }
    return tenant;
  }

  async updateBranding(tenantId: string, dto: UpdateBrandingDto) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        brandingConfig: dto.brandingConfig,
      },
    });
  }

  async updatePlan(tenantId: string, plan: any) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { plan },
    });
  }

  async rechargeQuota(dto: RechargeQuotaDto) {
    if (dto.amount <= 0) {
      throw new BadRequestException('قيمة الشحن يجب أن تكون أكبر من الصفر');
    }

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.update({
        where: { id: dto.tenantId },
        data: {
          quotaBalance: { increment: dto.amount },
        },
      });

      await tx.quotaHistory.create({
        data: {
          tenantId: dto.tenantId,
          delta: dto.amount,
          balanceAfter: tenant.quotaBalance,
          reason: dto.reason || 'MANUAL_RECHARGE',
        },
      });

      return tenant;
    });
  }

  async deductQuota(tenantId: string, amount = 1, reason = 'STUDENT_CONSUMPTION', referenceId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw new NotFoundException('المؤسسة غير موجودة');

      if (tenant.quotaBalance < amount) {
        throw new BadRequestException('رصيد باقة الاستهلاك (Pay-As-You-Go) غير كافٍ. يرجى الشحن للاستمرار.');
      }

      const updated = await tx.tenant.update({
        where: { id: tenantId },
        data: { quotaBalance: { decrement: amount } },
      });

      await tx.quotaHistory.create({
        data: {
          tenantId,
          delta: -amount,
          balanceAfter: updated.quotaBalance,
          reason,
          referenceId,
        },
      });

      return updated;
    });
  }

  async getQuotaHistory(tenantId: string) {
    return this.prisma.quotaHistory.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ===========================================================================
  // إدارة المساعدين والاستقبال (Staff & Receptionists)
  // ===========================================================================

  async getStaff(tenantId: string) {
    return this.prisma.user.findMany({
      where: {
        tenantId,
        role: { in: ['ASSISTANT', 'TENANT_ADMIN'] },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        role: true,
        permissions: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createStaff(tenantId: string, data: { name: string; phone: string; email?: string; password?: string; permissions?: any; role?: any }) {
    const existing = await this.prisma.user.findFirst({
      where: { tenantId, phone: data.phone },
    });
    if (existing) {
      throw new ConflictException('رقم الهاتف مسجل بالفعل لأحد موظفي السنتر');
    }

    const passwordHash = await bcrypt.hash(data.password || '123456', 10);
    return this.prisma.user.create({
      data: {
        tenantId,
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        passwordHash,
        role: data.role || 'ASSISTANT',
        permissions: data.permissions || {
          canCollectCash: true,
          canScanQR: true,
          canGradeHomework: true,
          canManageInventory: true,
        },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        role: true,
        permissions: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async updateStaff(tenantId: string, id: string, data: any) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
    });
    if (!user) {
      throw new NotFoundException('الموظف غير موجود');
    }

    let passwordHash = undefined;
    if (data.password) {
      passwordHash = await bcrypt.hash(data.password, 10);
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.phone ? { phone: data.phone } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.permissions ? { permissions: data.permissions } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.role ? { role: data.role } : {}),
        ...(passwordHash ? { passwordHash } : {}),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        role: true,
        permissions: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async deleteStaff(tenantId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
    });
    if (!user) {
      throw new NotFoundException('الموظف غير موجود');
    }
    return this.prisma.user.delete({
      where: { id },
    });
  }
}
