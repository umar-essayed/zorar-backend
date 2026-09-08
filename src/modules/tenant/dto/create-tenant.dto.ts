import { IsString, IsNotEmpty, IsEnum, IsOptional, Matches } from 'class-validator';
import { TenantType, PlanType } from '@prisma/client';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty({ message: 'اسم السنتر أو المدرس مطلوب' })
  name: string;

  @IsEnum(TenantType, { message: 'نوع المؤسسة يجب أن يكون CENTER أو TEACHER أو CLINIC' })
  type: TenantType;

  @IsEnum(PlanType, { message: 'خطة الاشتراك يجب أن تكون STANDARD أو PRO' })
  @IsOptional()
  plan?: PlanType;

  @IsString()
  @IsOptional()
  @Matches(/^[a-z0-9-]+$/, { message: 'النطاق الفرعي يجب أن يحتوي على حروف صغيرة وأرقام وعلامة - فقط' })
  subdomain?: string;

  @IsString()
  @IsOptional()
  customDomain?: string;

  @IsOptional()
  stages?: string[];
}
