import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class CreateBookDto {
  @IsString()
  @IsNotEmpty({ message: 'عنوان الملزمة مطلوب' })
  title: string;

  @IsString()
  @IsNotEmpty({ message: 'معرف المادة مطلوب' })
  subjectId: string;

  @IsString()
  @IsNotEmpty({ message: 'معرف المرحلة الدراسية مطلوب' })
  academicYearId: string;

  @IsString()
  @IsOptional()
  teacherId?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  coverUrl?: string;

  @IsString()
  @IsOptional()
  fileUrl?: string;

  @IsNumber()
  printCost: number;

  @IsNumber()
  salePrice: number;

  @IsNumber()
  @IsOptional()
  stockQuantity?: number;

  @IsNumber()
  @IsOptional()
  minStockAlert?: number;
}

export class RecordBookSaleDto {
  @IsString()
  @IsNotEmpty({ message: 'معرف الملزمة مطلوب' })
  bookId: string;

  @IsString()
  @IsNotEmpty({ message: 'كود الطالب مطلوب' })
  studentCode: string;

  @IsNumber()
  @IsOptional()
  quantity?: number;
}
