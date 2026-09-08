import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService) {}

  async createExpense(tenantId: string, assistantId: string, dto: CreateExpenseDto) {
    return this.prisma.expense.create({
      data: {
        tenantId,
        recordedById: assistantId,
        category: dto.category,
        amount: dto.amount,
        description: dto.description,
        receiptUrl: dto.receiptUrl,
      },
      include: {
        recordedBy: { select: { name: true } },
      },
    });
  }

  async getExpenses(tenantId: string, category?: string, dateStr?: string) {
    const targetDate = dateStr ? new Date(dateStr) : null;
    let dateFilter = {};
    if (targetDate) {
      const start = new Date(targetDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(targetDate);
      end.setHours(23, 59, 59, 999);
      dateFilter = { paidAt: { gte: start, lte: end } };
    }

    return this.prisma.expense.findMany({
      where: {
        tenantId,
        ...(category ? { category: category as any } : {}),
        ...dateFilter,
      },
      include: {
        recordedBy: { select: { name: true } },
      },
      orderBy: { paidAt: 'desc' },
    });
  }

  // حساب الأرباح الصافية للسنتر (Net Profit Breakdown)
  async getNetProfitSummary(tenantId: string, month: number, year: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    // إجمالي الدخل
    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate },
      },
    });
    const totalIncome = transactions.reduce((sum, t) => sum + Number(t.amount), 0);

    // إجمالي المصروفات
    const expenses = await this.prisma.expense.findMany({
      where: {
        tenantId,
        paidAt: { gte: startDate, lte: endDate },
      },
    });
    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

    // إجمالي تصفيات المدرسين
    const payouts = await this.prisma.teacherPayout.findMany({
      where: {
        tenantId,
        paidAt: { gte: startDate, lte: endDate },
      },
    });
    const totalTeacherPayouts = payouts.reduce((sum, p) => sum + Number(p.netPaid), 0);

    const netProfit = totalIncome - totalExpenses - totalTeacherPayouts;

    return {
      period: `${month}/${year}`,
      totalIncome,
      totalExpenses,
      totalTeacherPayouts,
      netProfit,
    };
  }
}
