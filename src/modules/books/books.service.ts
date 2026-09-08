import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateBookDto, RecordBookSaleDto } from './dto/create-book.dto';

@Injectable()
export class BooksService {
  constructor(private prisma: PrismaService) {}

  async createBook(tenantId: string, dto: CreateBookDto) {
    return this.prisma.book.create({
      data: {
        tenantId,
        title: dto.title,
        subjectId: dto.subjectId,
        academicYearId: dto.academicYearId,
        teacherId: dto.teacherId,
        description: dto.description,
        coverUrl: dto.coverUrl,
        printCost: dto.printCost,
        salePrice: dto.salePrice,
        stockQuantity: dto.stockQuantity || 0,
        minStockAlert: dto.minStockAlert || 10,
      },
      include: {
        subject: true,
        academicYear: true,
        teacher: true,
      },
    });
  }

  async getBooks(tenantId: string) {
    return this.prisma.book.findMany({
      where: { tenantId, isActive: true },
      include: {
        subject: true,
        academicYear: true,
        teacher: { select: { name: true } },
        _count: { select: { sales: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // بيع ملزمة لطالب وخصمها من المخزن مع تسجيل الحركة المالية
  async sellBook(tenantId: string, assistantId: string, dto: RecordBookSaleDto) {
    const book = await this.prisma.book.findFirst({
      where: { id: dto.bookId, tenantId },
    });
    if (!book) throw new NotFoundException('الملزمة غير موجودة');

    const qty = dto.quantity || 1;
    if (book.stockQuantity < qty) {
      throw new BadRequestException(`الكمية المتاحة في المخزن (${book.stockQuantity}) غير كافية`);
    }

    const student = await this.prisma.student.findUnique({
      where: { tenantId_studentCode: { tenantId, studentCode: dto.studentCode } },
    });
    if (!student) throw new NotFoundException('الطالب غير مسجل');

    const totalPrice = Number(book.salePrice) * qty;

    return this.prisma.$transaction(async (tx) => {
      // 1. خصم الكمية من المخزن
      await tx.book.update({
        where: { id: book.id },
        data: { stockQuantity: { decrement: qty } },
      });

      // 2. تسجيل عملية بيع الملزمة
      const sale = await tx.bookSale.create({
        data: {
          tenantId,
          bookId: book.id,
          studentId: student.id,
          assistantId,
          quantity: qty,
          unitPrice: book.salePrice,
          totalPrice,
        },
      });

      // 3. تسجيل الحركة في الخزينة
      await tx.transaction.create({
        data: {
          tenantId,
          studentId: student.id,
          assistantId,
          amount: totalPrice,
          type: 'BOOK_NOTE_PURCHASE',
          description: `شراء ملزمة: ${book.title} (عدد ${qty})`,
        },
      });

      // 4. تسجيل في الـ Audit Log
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: assistantId,
          action: 'BOOK_DISPATCHED',
          entityType: 'BookSale',
          entityId: sale.id,
          details: {
            bookTitle: book.title,
            studentCode: student.studentCode,
            quantity: qty,
            totalPrice,
          },
        },
      });

      return {
        saleId: sale.id,
        bookTitle: book.title,
        studentName: student.name,
        quantity: qty,
        totalPrice,
        remainingStock: book.stockQuantity - qty,
      };
    });
  }

  async getLowStockAlerts(tenantId: string) {
    const books = await this.prisma.book.findMany({
      where: { tenantId, isActive: true },
    });
    return books.filter((b) => b.stockQuantity <= b.minStockAlert);
  }

  async updateBook(tenantId: string, id: string, dto: any) {
    const book = await this.prisma.book.findFirst({ where: { id, tenantId } });
    if (!book) throw new NotFoundException('المذكرة غير موجودة');

    return this.prisma.book.update({
      where: { id },
      data: {
        ...(dto.title ? { title: dto.title } : {}),
        ...(dto.subjectId ? { subjectId: dto.subjectId } : {}),
        ...(dto.academicYearId ? { academicYearId: dto.academicYearId } : {}),
        ...(dto.teacherId !== undefined ? { teacherId: dto.teacherId || null } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.coverUrl !== undefined ? { coverUrl: dto.coverUrl } : {}),
        ...(dto.salePrice !== undefined ? { salePrice: dto.salePrice } : {}),
        ...(dto.printCost !== undefined ? { printCost: dto.printCost } : {}),
        ...(dto.stockQuantity !== undefined ? { stockQuantity: dto.stockQuantity } : {}),
        ...(dto.minStockAlert !== undefined ? { minStockAlert: dto.minStockAlert } : {}),
      },
      include: {
        subject: true,
        academicYear: true,
        teacher: true,
      },
    });
  }

  async deleteBook(tenantId: string, id: string) {
    const book = await this.prisma.book.findFirst({ where: { id, tenantId } });
    if (!book) throw new NotFoundException('المذكرة غير موجودة');

    return this.prisma.book.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
