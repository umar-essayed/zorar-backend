import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateBrandingDto, RechargeQuotaDto } from './dto/update-branding.dto';

@Injectable()
export class TenantService {
  constructor(private prisma: PrismaService) {}

  async createTenant(dto: CreateTenantDto) {
    const rawSubdomain = dto.subdomain?.trim() || `zorar-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`;
    const cleanSubdomain = rawSubdomain.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');

    const existingSubdomain = await this.prisma.tenant.findUnique({
      where: { subdomain: cleanSubdomain },
    });
    if (existingSubdomain) {
      throw new ConflictException('النطاق الفرعي محجوز بالفعل لمؤسسة أخرى');
    }

    if (dto.customDomain) {
      const existingDomain = await this.prisma.tenant.findUnique({
        where: { customDomain: dto.customDomain.toLowerCase() },
      });
      if (existingDomain) {
        throw new ConflictException('النطاق المخصص محجوز بالفعل');
      }
    }

    const tenant = await this.prisma.tenant.create({
      data: {
        name: dto.name,
        type: dto.type,
        plan: dto.plan || 'PRO', // خطة برو تلقائياً
        subdomain: cleanSubdomain,
        customDomain: dto.customDomain ? dto.customDomain.toLowerCase() : null,
        quotaBalance: 10, // 10 رصيد مجاني برو ترحيبي
        settings: {
          selectedStages: dto.stages || ['SECONDARY'],
        },
        brandingConfig: {
          primaryColor: '#2563eb',
          secondaryColor: '#1e40af',
          themeMode: 'light',
          logoUrl: null,
          heroBannerUrl: null,
        },
      },
    });

    // تسجيل رصيد الترحيب بالـ History
    await this.prisma.quotaHistory
      .create({
        data: {
          tenantId: tenant.id,
          delta: 10,
          balanceAfter: 10,
          reason: 'WELCOME_BONUS_PRO',
        },
      })
      .catch(() => null);

    return tenant;
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

  async getQuotaPricingAndPlans(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, plan: true, quotaBalance: true, settings: true },
    });
    if (!tenant) throw new NotFoundException('المؤسسة غير موجودة');

    const studentsCount = await this.prisma.student.count({ where: { tenantId } });

    const priceStandard = parseFloat(process.env.STUDENT_PRICE_STANDARD_EGP || '2.0');
    const pricePro = parseFloat(process.env.STUDENT_PRICE_PRO_EGP || '5.0');

    const currentSettings = (tenant.settings as Record<string, any>) || {};
    const transferPhone = currentSettings.rechargeTransferPhone || process.env.RECHARGE_TRANSFER_PHONE || '01553442304';

    return {
      currency: 'EGP',
      currentPlan: tenant.plan,
      quotaBalance: tenant.quotaBalance,
      activeStudentsCount: studentsCount,
      pricing: {
        standardPerStudentEgp: priceStandard,
        proPerStudentEgp: pricePro,
      },
      transferAccount: {
        phone: transferPhone,
        methods: ['فودافون كاش (Vodafone Cash)', 'إنستاباي (InstaPay)'],
        holderName: 'Zorar Code - إدارة السداد المالي والشحن',
        note: 'يرجى تحويل المبلغ ثم إرفاق صورة/سكرين شوت التحويل لتأكيد الشحن فورياً',
      },
      planFeatures: {
        STANDARD: [
          'دليل وقيد الطلاب وكروت الـ QR',
          'تسجيل الحضور والغياب الميداني السريع',
          'إدارة المجموعات والمواعيد والقاعات',
          'سجل المصروفات والخزينة اليومية وطباعة الإيصالات',
        ],
        PRO: [
          'جميع مميزات الباقة العادية (STANDARD)',
          'منصة الكورسات الإلكترونية والفيديوهات المشفرة',
          'بوابة واتساب الذكية لإرسال التنبيهات والغياب تلقائياً',
          'كوكبيت المدرس ورصد الدرجات والتقييم والواجبات لحظياً',
          'تحليلات بيانية متقدمة للأرباح والأداء ونسب الإيراد',
          'دعم فني مخصص ونسخ احتياطي فوري سحابي',
        ],
      },
    };
  }

  async requestQuotaTopup(
    tenantId: string,
    dto: { type: 'STANDARD' | 'PRO'; quantity: number; paymentMethod?: string; notes?: string; screenshotUrl?: string },
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, settings: true },
    });
    if (!tenant) throw new NotFoundException('المؤسسة غير موجودة');

    if (!dto.quantity || dto.quantity <= 0) {
      throw new BadRequestException('يجب تحديد كمية رصيد صحيحة أكبر من صفر');
    }

    const priceStandard = parseFloat(process.env.STUDENT_PRICE_STANDARD_EGP || '2.0');
    const pricePro = parseFloat(process.env.STUDENT_PRICE_PRO_EGP || '5.0');
    const unitPrice = dto.type === 'PRO' ? pricePro : priceStandard;
    const totalPrice = unitPrice * dto.quantity;

    const currentSettings = (tenant.settings as Record<string, any>) || {};
    const existingRequests = (currentSettings.quotaRequests as any[]) || [];

    const newRequest = {
      id: `req-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type: dto.type,
      quantity: dto.quantity,
      unitPriceEgp: unitPrice,
      totalPriceEgp: totalPrice,
      paymentMethod: dto.paymentMethod || 'INSTAPAY_OR_WALLET',
      notes: dto.notes || '',
      screenshotUrl: dto.screenshotUrl || null,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    existingRequests.unshift(newRequest);

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...currentSettings,
          quotaRequests: existingRequests,
        },
      },
    });

    return {
      success: true,
      message: 'تم تسجيل طلب شحن الرصيد بنجاح، جاري مراجعته وتأكيده',
      request: newRequest,
    };
  }

  async getQuotaTopupRequests(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const currentSettings = (tenant?.settings as Record<string, any>) || {};
    return (currentSettings.quotaRequests as any[]) || [];
  }

  // ===========================================================================
  // التحقق من توفر السلاج والنطاق (Slug Availability Check)
  // ===========================================================================
  async checkSubdomainAvailability(subdomain: string, tenantId?: string) {
    const clean = (subdomain || '').trim().toLowerCase();
    if (!clean || clean.length < 3) {
      return { available: false, slug: clean, reason: 'يجب أن يتكون المعرّف من 3 أحرف على الأقل' };
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { subdomain: clean },
      select: { id: true, name: true },
    });
    if (!tenant) {
      return { available: true, slug: clean, isCurrent: false };
    }
    if (tenantId && tenant.id === tenantId) {
      return { available: true, slug: clean, isCurrent: true };
    }
    return { available: false, slug: clean, isCurrent: false };
  }

  // ===========================================================================
  // بروفايل وسجل نشاط المساعد المفصل (Staff Activity & Performance Profile)
  // ===========================================================================
  async getStaffActivityProfile(tenantId: string, staffId: string, timeRange: string = 'today') {
    const user = await this.prisma.user.findFirst({
      where: { id: staffId, tenantId },
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
    });
    if (!user) throw new NotFoundException('الموظف / المساعد غير موجود');

    const now = new Date();
    let startDate: Date;
    if (timeRange === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    } else if (timeRange === 'week') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (timeRange === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    } else {
      startDate = new Date(0); // all time
    }

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    const isPrivileged = user.role === 'TENANT_ADMIN' || user.role === 'SUPER_ADMIN';

    const [
      attendancesInPeriod,
      todayScansCount,
      transactionsInPeriod,
      expensesInPeriod,
      auditLogsInPeriod,
      totalLoginsCount,
    ] = await Promise.all([
      this.prisma.attendance.findMany({
        where: {
          tenantId,
          ...(isPrivileged ? {} : { scannedById: staffId }),
          scannedAt: { gte: startDate },
        },
        include: {
          student: { select: { id: true, name: true, studentCode: true, phone: true } },
          group: { select: { id: true, name: true } },
        },
        orderBy: { scannedAt: 'desc' },
      }),
      this.prisma.attendance.count({
        where: {
          tenantId,
          ...(isPrivileged ? {} : { scannedById: staffId }),
          scannedAt: { gte: startOfToday },
        },
      }),
      this.prisma.transaction.findMany({
        where: {
          tenantId,
          ...(isPrivileged ? {} : { OR: [{ assistantId: staffId }, { assistantId: null }] }),
          createdAt: { gte: startDate },
        },
        include: {
          student: { select: { id: true, name: true, studentCode: true } },
          group: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.expense.findMany({
        where: {
          tenantId,
          recordedById: staffId,
          paidAt: { gte: startDate },
        },
        orderBy: { paidAt: 'desc' },
      }),
      this.prisma.auditLog.findMany({
        where: {
          tenantId,
          userId: staffId,
          createdAt: { gte: startDate },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.prisma.auditLog.count({
        where: {
          tenantId,
          userId: staffId,
          action: 'LOGIN',
        },
      }),
    ]);

    // Group-wise attendance summary for today / period
    const groupStatsMap: Record<string, { id: string; name: string; count: number; lastScan: Date }> = {};
    for (const att of attendancesInPeriod) {
      const gid = att.groupId;
      const gname = att.group?.name || 'مجموعة عامة';
      if (!groupStatsMap[gid]) {
        groupStatsMap[gid] = { id: gid, name: gname, count: 0, lastScan: att.scannedAt };
      }
      groupStatsMap[gid].count++;
      if (att.scannedAt > groupStatsMap[gid].lastScan) {
        groupStatsMap[gid].lastScan = att.scannedAt;
      }
    }
    const groupsScanned = Object.values(groupStatsMap);

    // Financial summaries
    let totalCashCollected = 0;
    let totalExpensesSum = 0;
    let totalDiscountsSum = 0;
    const discountsList: any[] = [];

    for (const tx of transactionsInPeriod) {
      const amt = Number(tx.amount || 0);
      if (amt > 0) totalCashCollected += amt;

      const desc = (tx.description || '').toLowerCase();
      if (desc.includes('خصم') || desc.includes('discount')) {
        totalDiscountsSum += Math.abs(amt);
        discountsList.push({
          id: tx.id,
          studentName: tx.student?.name || 'طالب',
          studentCode: tx.student?.studentCode || '',
          amount: amt,
          description: tx.description,
          date: tx.createdAt,
        });
      }
    }

    for (const exp of expensesInPeriod) {
      totalExpensesSum += Number(exp.amount || 0);
    }

    const stats = {
      cashCollected: Math.round(totalCashCollected * 100) / 100,
      totalCashCollected: Math.round(totalCashCollected * 100) / 100,
      posInvoicesCount: transactionsInPeriod.length,
      transactionsCount: transactionsInPeriod.length,
      attendanceScans: attendancesInPeriod.length,
      todayScans: todayScansCount,
      periodScans: attendancesInPeriod.length,
      discountsGiven: Math.round(totalDiscountsSum * 100) / 100,
      totalDiscounts: Math.round(totalDiscountsSum * 100) / 100,
      expensesRecorded: Math.round(totalExpensesSum * 100) / 100,
      totalExpenses: Math.round(totalExpensesSum * 100) / 100,
      auditActionsCount: auditLogsInPeriod.length,
      totalLogins: Math.max(totalLoginsCount, 1),
      lastLoginAt: user.lastLoginAt,
      registeredDaysAgo: Math.max(0, Math.floor((now.getTime() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24))),
    };

    const recentInvoices = transactionsInPeriod.slice(0, 20).map((t) => ({
      id: t.id,
      receiptNo: t.receiptNo,
      invoiceNumber: t.receiptNo,
      amount: Number(t.amount || 0),
      total: Number(t.amount || 0),
      method: t.method,
      paymentMethod: t.method,
      studentName: t.student?.name || '',
      groupName: t.group?.name || '',
      description: t.description,
      paidAt: t.createdAt,
      createdAt: t.createdAt,
    }));

    return {
      user,
      staff: user,
      timeRange,
      stats,
      kpis: stats,
      groupsScanned,
      recentScans: attendancesInPeriod.slice(0, 20).map((a) => ({
        id: a.id,
        studentName: a.student?.name || 'طالب',
        studentCode: a.student?.studentCode || '',
        groupName: a.group?.name || '',
        scannedAt: a.scannedAt,
        status: a.status,
      })),
      recentTransactions: recentInvoices,
      recentInvoices,
      discountsList,
      expensesList: expensesInPeriod.slice(0, 15).map((e) => ({
        id: e.id,
        amount: Number(e.amount || 0),
        title: e.description,
        description: e.description,
        category: e.category,
        receiptUrl: e.receiptUrl,
        paidAt: e.paidAt,
        createdAt: e.paidAt,
      })),
      auditTimeline: auditLogsInPeriod.map((log) => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        details: log.details,
        createdAt: log.createdAt,
      })),
    };
  }
}

