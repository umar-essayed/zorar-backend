import { IsString, IsNotEmpty, IsObject, IsOptional } from 'class-validator';

export class CreateAdmissionFormDto {
  @IsString()
  @IsNotEmpty({ message: 'عنوان استمارة التقديم مطلوب' })
  title: string;

  @IsString()
  @IsNotEmpty({ message: 'الاسم اللطيف (Slug) مطلوب' })
  slug: string;

  @IsObject()
  fieldsConfig: any; // حقول الاستمارة الديناميكية
}

export class SubmitAdmissionDto {
  @IsString()
  @IsNotEmpty({ message: 'اسم الطالب مطلوب' })
  studentName: string;

  @IsString()
  @IsNotEmpty({ message: 'رقم هاتف الطالب مطلوب' })
  phone: string;

  @IsString()
  @IsNotEmpty({ message: 'رقم هاتف ولي الأمر مطلوب' })
  guardianPhone: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsObject()
  formData: any;
}
