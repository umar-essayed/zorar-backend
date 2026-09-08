import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('api/v1/expenses')
@UseGuards(JwtAuthGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  createExpense(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') assistantId: string,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.expensesService.createExpense(tenantId, assistantId, dto);
  }

  @Get()
  getExpenses(
    @CurrentTenant() tenantId: string,
    @Query('category') category?: string,
    @Query('date') date?: string,
  ) {
    return this.expensesService.getExpenses(tenantId, category, date);
  }

  @Get('net-profit')
  getNetProfit(
    @CurrentTenant() tenantId: string,
    @Query('month') month: number,
    @Query('year') year: number,
  ) {
    return this.expensesService.getNetProfitSummary(
      tenantId,
      month ? Number(month) : new Date().getMonth() + 1,
      year ? Number(year) : new Date().getFullYear(),
    );
  }
}
