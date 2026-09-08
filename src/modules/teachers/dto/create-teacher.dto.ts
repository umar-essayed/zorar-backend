import { IsString, IsNotEmpty, IsEnum, IsNumber, IsOptional } from 'class-validator';
import { CommissionType } from '@prisma/client';

export class CreateTeacherDto {
  @IsString()
  @IsNotEmpty({ message: 'اسم المدرس مطلوب' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'رقم هاتف المدرس مطلوب' })
  phone: string;

  @IsString()
  @IsOptional()
  subjectId?: string;

  @IsEnum(CommissionType)
  @IsOptional()
  commissionType?: CommissionType;

  @IsNumber()
  @IsOptional()
  commissionValue?: number; // القيمة المدخلة من الواجهة (نسبة أو مبلغ ثابت)

  @IsNumber()
  @IsOptional()
  centerPercentage?: number; // نسبة السنتر (افتراضياً 20%)

  @IsNumber()
  @IsOptional()
  fixedCenterFee?: number; // أو مبلغ ثابت عن كل طالب

  @IsString()
  @IsOptional()
  bio?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @IsString()
  @IsOptional()
  password?: string;
}

export class CreateTeacherPayoutDto {
  @IsString()
  @IsNotEmpty({ message: 'معرف المدرس مطلوب' })
  teacherId: string;

  @IsString()
  @IsNotEmpty({ message: 'تاريخ بداية الفترة مطلوب' })
  periodStart: string;

  @IsString()
  @IsNotEmpty({ message: 'تاريخ نهاية الفترة مطلوب' })
  periodEnd: string;

  @IsNumber()
  deductions?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
