import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateTransactionDto, CloseShiftDto, GetTransactionsFilterDto } from './dto/create-transaction.dto';

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  private generateReceiptNo(): string {
    return `REC-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
  }

  // مزامنة ومعالجة أي معاملات سابقة ينقصها الربط المباشر بالمجموعة أو المدرس
  private async autoLinkTransactions(tenantId: string) {
    try {
      const unlinked = await this.prisma.transaction.findMany({
        where: {
          tenantId,
          groupId: null,
          studentId: { not: null },
        },
        take: 50,
      });

      for (const tx of unlinked) {
        if (!tx.studentId) continue;
        const student = await this.prisma.student.findUnique({
          where: { id: tx.studentId },
          include: {
            groups: { include: { group: true } },
          },
        });

        const targetGroup = student?.groups?.[0]?.group;
        if (targetGroup) {
          await this.prisma.transaction.update({
            where: { id: tx.id },
            data: {
              groupId: targetGroup.id,
              teacherId: targetGroup.teacherId,
              subjectId: targetGroup.subjectId,
              academicYearId: targetGroup.academicYearId,
            },
          });
        }
      }
    } catch {
      // Non-blocking auto-link background helper
    }
  }

  async recordTransaction(tenantId: string, assistantId: string, dto: CreateTransactionDto) {
    const student = await this.prisma.student.findUnique({
      where: { tenantId_studentCode: { tenantId, studentCode: dto.studentCode } },
      include: {
        groups: { include: { group: true } },
      },
    });
    if (!student) {
      throw new NotFoundException(`الطالب بكود (${dto.studentCode}) غير موجود`);
    }

    let resolvedGroupId = dto.groupId || null;
    let resolvedTeacherId = dto.teacherId || null;
    let resolvedSubjectId = dto.subjectId || null;
    let resolvedAcademicYearId = dto.academicYearId || null;

    if (resolvedGroupId) {
      const group = await this.prisma.group.findUnique({
        where: { id: resolvedGroupId },
      });
      if (group) {
        resolvedTeacherId = resolvedTeacherId || group.teacherId;
        resolvedSubjectId = resolvedSubjectId || group.subjectId;
        resolvedAcademicYearId = resolvedAcademicYearId || group.academicYearId;
      }
    } else {
      const defaultGroup = student.groups?.[0]?.group;
      if (defaultGroup) {
        resolvedGroupId = defaultGroup.id;
        resolvedTeacherId = defaultGroup.teacherId;
        resolvedSubjectId = defaultGroup.subjectId;
        resolvedAcademicYearId = defaultGroup.academicYearId;
      }
    }

    const receiptNo = this.generateReceiptNo();

    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          tenantId,
          studentId: student.id,
          groupId: resolvedGroupId,
          teacherId: resolvedTeacherId,
          subjectId: resolvedSubjectId,
          academicYearId: resolvedAcademicYearId,
          assistantId: assistantId || null,
          amount: dto.amount,
          type: dto.type,
          method: dto.method || 'CASH',
          receiptNo,
          description: dto.description,
        },
        include: {
          student: { select: { id: true, name: true, studentCode: true, phone: true } },
          group: { select: { id: true, name: true } },
          teacher: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
          academicYear: { select: { id: true, name: true } },
          assistant: { select: { id: true, name: true } },
        },
      });

      // تسجيل إجراء المساعد في سجل التدقيق (Audit Log)
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: assistantId || null,
          action: 'COLLECTED_CASH',
          entityType: 'Transaction',
          entityId: transaction.id,
          details: {
            receiptNo,
            studentCode: student.studentCode,
            studentName: student.name,
            amount: dto.amount,
            type: dto.type,
          },
        },
      });

      // الربط التلقائي بالمنصة: إذا كان السداد لحصة أو كورس، يُفتح المحتوى الأونلاين للطالب فورياً!
      if (dto.courseIdToUnlock) {
        await tx.studentCourseEnrollment.upsert({
          where: {
            studentId_courseId: {
              studentId: student.id,
              courseId: dto.courseIdToUnlock,
            },
          },
          update: {
            unlockedAt: new Date(),
          },
          create: {
            studentId: student.id,
            courseId: dto.courseIdToUnlock,
            source: 'AUTO_OFFLINE_SYNC',
          },
        });
      }

      return transaction;
    });
  }

  async closeCashierShift(tenantId: string, assistantId: string, dto: CloseShiftDto) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // حساب إجمالي النقدية المحصلة من هذا المساعد اليوم
    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        assistantId,
        method: 'CASH',
        createdAt: { gte: startOfToday },
      },
    });

    const totalExpectedCash = transactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const variance = dto.totalActualCash - totalExpectedCash;

    return this.prisma.cashierClosing.create({
      data: {
        tenantId,
        assistantId,
        shiftStart: startOfToday,
        shiftEnd: new Date(),
        totalExpectedCash,
        totalActualCash: dto.totalActualCash,
        varianceAmount: variance,
        notes: dto.notes,
        isApproved: false,
      },
    });
  }

  // =========================================================================
  // جارد وسجل مدفوعات الطلاب المتقدم مع الفلاتر الشاملة (Transactions Ledger)
  // =========================================================================
  async getTransactions(tenantId: string, filter: GetTransactionsFilterDto) {
    // محاولة ربط المعاملات السابقة تلقائياً بالخلفية
    this.autoLinkTransactions(tenantId).catch(() => {});

    const where: any = { tenantId };

    if (filter.groupId) where.groupId = filter.groupId;
    if (filter.teacherId) where.teacherId = filter.teacherId;
    if (filter.subjectId) where.subjectId = filter.subjectId;
    if (filter.academicYearId) where.academicYearId = filter.academicYearId;
    if (filter.studentId) where.studentId = filter.studentId;
    if (filter.type) where.type = filter.type as any;
    if (filter.method) where.method = filter.method as any;

    if (filter.startDate || filter.endDate) {
      where.createdAt = {};
      if (filter.startDate) {
        const s = new Date(filter.startDate);
        s.setHours(0, 0, 0, 0);
        where.createdAt.gte = s;
      }
      if (filter.endDate) {
        const e = new Date(filter.endDate);
        e.setHours(23, 59, 59, 999);
        where.createdAt.lte = e;
      }
    }

    if (filter.search && filter.search.trim()) {
      const q = filter.search.trim();
      where.OR = [
        { receiptNo: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { student: { name: { contains: q, mode: 'insensitive' } } },
        { student: { studentCode: { contains: q, mode: 'insensitive' } } },
        { student: { phone: { contains: q } } },
      ];
    }

    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(200, Math.max(10, Number(filter.limit) || 100));
    const skip = (page - 1) * limit;

    const [totalCount, transactions] = await Promise.all([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              name: true,
              studentCode: true,
              phone: true,
              guardianPhone: true,
            },
          },
          group: {
            select: {
              id: true,
              name: true,
            },
          },
          teacher: {
            select: {
              id: true,
              name: true,
            },
          },
          subject: {
            select: {
              id: true,
              name: true,
            },
          },
          academicYear: {
            select: {
              id: true,
              name: true,
            },
          },
          assistant: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    // حساب الإجماليات والتوزيعات المالية الدقيقة (Aggregates)
    const allFilteredTransactions = await this.prisma.transaction.findMany({
      where,
      select: {
        amount: true,
        method: true,
        type: true,
        teacherId: true,
        groupId: true,
        teacher: { select: { id: true, name: true } },
        group: { select: { id: true, name: true } },
      },
    });

    let totalAmount = 0;
    const byMethod: Record<string, number> = {
      CASH: 0,
      VODAFONE_CASH: 0,
      INSTAPAY: 0,
      CREDIT_CARD: 0,
    };
    const byType: Record<string, number> = {};
    const teacherMap: Record<string, { name: string; amount: number; count: number }> = {};
    const groupMap: Record<string, { name: string; amount: number; count: number }> = {};

    for (const t of allFilteredTransactions) {
      const amt = Number(t.amount) || 0;
      totalAmount += amt;

      if (t.method && byMethod[t.method] !== undefined) {
        byMethod[t.method] += amt;
      }
      if (t.type) {
        byType[t.type] = (byType[t.type] || 0) + amt;
      }

      const tId = t.teacherId || 'other';
      const tName = t.teacher?.name || 'عام / بدون مدرس';
      if (!teacherMap[tId]) teacherMap[tId] = { name: tName, amount: 0, count: 0 };
      teacherMap[tId].amount += amt;
      teacherMap[tId].count += 1;

      const gId = t.groupId || 'other';
      const gName = t.group?.name || 'عام / بدون مجموعة';
      if (!groupMap[gId]) groupMap[gId] = { name: gName, amount: 0, count: 0 };
      groupMap[gId].amount += amt;
      groupMap[gId].count += 1;
    }

    return {
      items: transactions,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      page,
      limit,
      aggregates: {
        totalAmount,
        byMethod,
        byType,
        byTeacher: Object.entries(teacherMap).map(([id, val]) => ({ id, ...val })),
        byGroup: Object.entries(groupMap).map(([id, val]) => ({ id, ...val })),
      },
    };
  }

  // =========================================================================
  // نظرة مالية شاملة للسنتر (Finance Overview)
  // =========================================================================
  async getFinanceOverview(tenantId: string) {
    const now = new Date();

    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      incomeAgg,
      expenseAgg,
      todayIncomeAgg,
      todayExpenseAgg,
      monthIncomeAgg,
      monthExpenseAgg,
      unpaidSubsAgg,
    ] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: { tenantId },
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.expense.aggregate({
        where: { tenantId },
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.transaction.aggregate({
        where: { tenantId, createdAt: { gte: startOfToday } },
        _sum: { amount: true },
      }),
      this.prisma.expense.aggregate({
        where: { tenantId, paidAt: { gte: startOfToday } },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: { tenantId, createdAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      this.prisma.expense.aggregate({
        where: { tenantId, paidAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      this.prisma.monthlySubscription.aggregate({
        where: {
          tenantId,
          monthNumber: now.getMonth() + 1,
          isPaid: false,
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    const totalIncome = Number(incomeAgg._sum.amount || 0);
    const totalExpenses = Number(expenseAgg._sum.amount || 0);
    const netProfit = totalIncome - totalExpenses;

    const todayIncome = Number(todayIncomeAgg._sum.amount || 0);
    const todayExpensesAmount = Number(todayExpenseAgg._sum.amount || 0);

    const monthIncome = Number(monthIncomeAgg._sum.amount || 0);
    const monthExpensesAmount = Number(monthExpenseAgg._sum.amount || 0);

    const unpaidSubsAmount = Number(unpaidSubsAgg._sum.amount || 0);

    return {
      totalIncome,
      totalExpenses,
      netProfit,
      todayIncome,
      todayExpenses: todayExpensesAmount,
      todayNet: todayIncome - todayExpensesAmount,
      monthIncome,
      monthExpenses: monthExpensesAmount,
      monthNet: monthIncome - monthExpensesAmount,
      transactionsCount: incomeAgg._count.id || 0,
      expensesCount: expenseAgg._count.id || 0,
      unpaidSubscriptionsCount: unpaidSubsAgg._count.id || 0,
      unpaidSubscriptionsAmount: unpaidSubsAmount,
    };
  }

  // التقرير اليومي المتوافق
  async getDailyFinanceReport(tenantId: string, dateStr?: string) {
    const targetDate = dateStr ? new Date(dateStr) : new Date();
    const start = new Date(targetDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(targetDate);
    end.setHours(23, 59, 59, 999);

    const [transactions, expenses] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          tenantId,
          createdAt: { gte: start, lte: end },
        },
        include: {
          student: { select: { id: true, name: true, studentCode: true } },
          group: { select: { id: true, name: true } },
          teacher: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
          academicYear: { select: { id: true, name: true } },
          assistant: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.expense.findMany({
        where: {
          tenantId,
          paidAt: { gte: start, lte: end },
        },
      }),
    ]);

    const totalIncome = transactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

    return {
      date: start.toISOString().split('T')[0],
      totalIncome,
      totalExpenses,
      netProfit: totalIncome - totalExpenses,
      transactionsCount: transactions.length,
      expensesCount: expenses.length,
      transactions,
      expenses,
      summary: {
        totalIncome,
        totalExpenses,
        netProfit: totalIncome - totalExpenses,
      },
    };
  }
}

