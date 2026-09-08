import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { UserRole } from '@prisma/client';

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: 'رقم الهاتف مطلوب' })
  phone: string;

  @IsString()
  @IsNotEmpty({ message: 'كلمة المرور مطلوبة' })
  password: string;

  @IsString()
  @IsOptional()
  tenantId?: string;
}

export class StudentLoginDto {
  @IsString()
  @IsNotEmpty({ message: 'كود الطالب مطلوب' })
  studentCode: string;

  @IsString()
  @IsNotEmpty({ message: 'رقم الهاتف مطلوب' })
  phone: string;

  @IsString()
  @IsOptional()
  tenantId?: string;

  @IsString()
  @IsOptional()
  subdomain?: string;
}

export class RegisterUserDto {
  @IsString()
  @IsNotEmpty({ message: 'الاسم مطلوب' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'رقم الهاتف مطلوب' })
  phone: string;

  @IsString()
  @IsNotEmpty({ message: 'كلمة المرور مطلوبة' })
  password: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsString()
  @IsOptional()
  tenantId?: string;
}
