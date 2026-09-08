import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { CreateTransactionDto, CloseShiftDto } from './dto/create-transaction.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('api/v1/finance')
@UseGuards(JwtAuthGuard)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Post('transactions')
  createTransaction(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') assistantId: string,
    @Body() dto: CreateTransactionDto,
  ) {
    return this.financeService.recordTransaction(tenantId, assistantId, dto);
  }

  @Post('shift-closing')
  closeShift(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') assistantId: string,
    @Body() dto: CloseShiftDto,
  ) {
    return this.financeService.closeCashierShift(tenantId, assistantId, dto);
  }

  @Get('transactions')
  getTransactions(
    @CurrentTenant() tenantId: string,
    @Query() query: any,
  ) {
    return this.financeService.getTransactions(tenantId, query);
  }

  @Get('overview')
  getOverview(
    @CurrentTenant() tenantId: string,
  ) {
    return this.financeService.getFinanceOverview(tenantId);
  }

  @Get('daily-report')
  getDailyReport(
    @CurrentTenant() tenantId: string,
    @Query('date') date?: string,
  ) {
    return this.financeService.getDailyFinanceReport(tenantId, date);
  }
}
