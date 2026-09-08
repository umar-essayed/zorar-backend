import { IsString, IsNotEmpty, IsNumber, IsEnum, IsOptional } from 'class-validator';
import { ExpenseCategory } from '@prisma/client';

export class CreateExpenseDto {
  @IsEnum(ExpenseCategory)
  category: ExpenseCategory;

  @IsNumber()
  amount: number;

  @IsString()
  @IsNotEmpty({ message: 'وصف المصروف مطلوب' })
  description: string;

  @IsString()
  @IsOptional()
  receiptUrl?: string;
}
