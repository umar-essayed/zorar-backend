import { IsString, IsNotEmpty, IsNumber, IsOptional, IsBoolean } from 'class-validator';

export class CreateCourseDto {
  @IsString()
  @IsNotEmpty({ message: 'عنوان الكورس مطلوب' })
  title: string;

  @IsString()
  @IsNotEmpty({ message: 'الاسم اللطيف (slug) مطلوب' })
  slug: string;

  @IsString()
  @IsNotEmpty({ message: 'معرف السنة الدراسية مطلوب' })
  academicYearId: string;

  @IsString()
  @IsNotEmpty({ message: 'معرف المادة مطلوب' })
  subjectId: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  thumbnailUrl?: string;

  @IsNumber()
  @IsOptional()
  price?: number;
}

export class CreateChapterDto {
  @IsString()
  @IsNotEmpty({ message: 'عنوان الفصل مطلوب' })
  title: string;

  @IsNumber()
  @IsOptional()
  orderIndex?: number;
}

export class CreateLessonDto {
  @IsString()
  @IsNotEmpty({ message: 'عنوان الدرس مطلوب' })
  title: string;

  @IsString()
  @IsNotEmpty({ message: 'كود فيديو اليوتيوب الخام (YouTube ID) مطلوب' })
  rawYouTubeId: string; // مثل "dQw4w9WgXcQ" - يتم تشفيره فوراً وتخزينه مشفراً

  @IsNumber()
  @IsOptional()
  durationSeconds?: number;

  @IsBoolean()
  @IsOptional()
  isFreePreview?: boolean;

  @IsString()
  @IsOptional()
  pdfAttachmentUrl?: string;

  @IsString()
  @IsOptional()
  homeworkDetails?: string;

  @IsNumber()
  @IsOptional()
  orderIndex?: number;
}
