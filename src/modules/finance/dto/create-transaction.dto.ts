import { IsString, IsNotEmpty, IsNumber, IsEnum, IsOptional } from 'class-validator';
import { TransactionType, PaymentMethod } from '@prisma/client';

export class CreateTransactionDto {
  @IsString()
  @IsNotEmpty({ message: 'كود الطالب مطلوب' })
  studentCode: string;

  @IsNumber()
  amount: number;

  @IsEnum(TransactionType)
  type: TransactionType;

  @IsEnum(PaymentMethod)
  @IsOptional()
  method?: PaymentMethod;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  groupId?: string;

  @IsString()
  @IsOptional()
  teacherId?: string;

  @IsString()
  @IsOptional()
  subjectId?: string;

  @IsString()
  @IsOptional()
  academicYearId?: string;

  @IsString()
  @IsOptional()
  courseIdToUnlock?: string; // إذا كان الدفع لحصة أو شهر، نفتح الكورس المقابل أونلاين فوراً!
}

export class CloseShiftDto {
  @IsNumber()
  totalActualCash: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class GetTransactionsFilterDto {
  @IsString()
  @IsOptional()
  teacherId?: string;

  @IsString()
  @IsOptional()
  subjectId?: string;

  @IsString()
  @IsOptional()
  academicYearId?: string;

  @IsString()
  @IsOptional()
  groupId?: string;

  @IsString()
  @IsOptional()
  studentId?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  method?: string;

  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @IsOptional()
  search?: string;

  @IsOptional()
  page?: any;

  @IsOptional()
  limit?: any;
}
