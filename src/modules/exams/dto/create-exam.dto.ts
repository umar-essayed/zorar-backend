import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray, IsBoolean } from 'class-validator';

export class CreateQuestionDto {
  @IsString()
  @IsNotEmpty({ message: 'نص السؤال مطلوب' })
  text: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsNumber()
  points: number;

  @IsArray()
  options: { id: string; text: string }[];

  @IsString()
  @IsNotEmpty({ message: 'الإجابة الصحيحة مطلوبة (مثال: A)' })
  correctOption: string;

  @IsString()
  @IsOptional()
  explanation?: string;
}

export class CreateExamDto {
  @IsString()
  @IsNotEmpty({ message: 'عنوان الامتحان مطلوب' })
  title: string;

  @IsString()
  @IsOptional()
  instructions?: string;

  @IsString()
  @IsOptional()
  courseId?: string;

  @IsString()
  @IsOptional()
  groupId?: string;

  @IsArray()
  @IsOptional()
  groupIds?: string[];

  @IsString()
  @IsOptional()
  teacherId?: string;

  @IsString()
  @IsOptional()
  academicYearId?: string;

  @IsNumber()
  durationMinutes: number;

  @IsNumber()
  @IsOptional()
  passingScore?: number;

  @IsNumber()
  @IsOptional()
  maxAttempts?: number;

  @IsOptional()
  availableFrom?: string | Date;

  @IsOptional()
  availableUntil?: string | Date;

  @IsBoolean()
  @IsOptional()
  shuffleQuestions?: boolean;

  @IsBoolean()
  @IsOptional()
  showModelAnswers?: boolean;

  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;

  @IsArray()
  questions: CreateQuestionDto[];
}

export class SubmitExamDto {
  @IsNotEmpty()
  answers: Record<string, string>; // { questionId: selectedOption }
}
