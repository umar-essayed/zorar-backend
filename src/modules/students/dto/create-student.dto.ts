import { IsString, IsNotEmpty, IsOptional, IsArray, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class InitialPaymentDto {
  @IsNumber()
  amount: number;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  method?: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class CreateStudentDto {
  @IsString()
  @IsNotEmpty({ message: 'اسم الطالب مطلوب' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'رقم هاتف الطالب مطلوب' })
  phone: string;

  @IsString()
  @IsNotEmpty({ message: 'رقم ولي الأمر مطلوب' })
  guardianPhone: string;

  @IsString()
  @IsOptional()
  academicYearId?: string;

  @IsString()
  @IsOptional()
  studentCode?: string; // اختياري، وإذا لم يُرسل يتم توليده تلقائياً

  @IsString()
  @IsOptional()
  schoolName?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @IsOptional()
  groupIds?: string[];

  @ValidateNested()
  @Type(() => InitialPaymentDto)
  @IsOptional()
  initialPayment?: InitialPaymentDto;
}

export class BatchImportStudentsDto {
  @IsArray()
  students: CreateStudentDto[];
}
