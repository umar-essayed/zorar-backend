import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { BooksService } from './books.service';
import { CreateBookDto, RecordBookSaleDto } from './dto/create-book.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('api/v1/books')
@UseGuards(JwtAuthGuard)
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Post()
  createBook(@CurrentTenant() tenantId: string, @Body() dto: CreateBookDto) {
    return this.booksService.createBook(tenantId, dto);
  }

  @Get()
  getBooks(@CurrentTenant() tenantId: string) {
    return this.booksService.getBooks(tenantId);
  }

  @Get('low-stock')
  getLowStock(@CurrentTenant() tenantId: string) {
    return this.booksService.getLowStockAlerts(tenantId);
  }

  @Put(':id')
  updateBook(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.booksService.updateBook(tenantId, id, dto);
  }

  @Delete(':id')
  deleteBook(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.booksService.deleteBook(tenantId, id);
  }

  @Post('sell')
  sellBook(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') assistantId: string,
    @Body() dto: RecordBookSaleDto,
  ) {
    return this.booksService.sellBook(tenantId, assistantId, dto);
  }
}
