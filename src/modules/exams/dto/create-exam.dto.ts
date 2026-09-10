import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray, IsBoolean } from 'class-validator';

export class CreateQuestionDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  @IsNotEmpty({ message: 'نص السؤال مطلوب' })
  text: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsNumber()
  @IsOptional()
  points?: number;

  @IsArray()
  options: any[];

  @IsString()
  @IsOptional()
  correctOption?: string;

  @IsString()
  @IsOptional()
  correctAnswer?: string;

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
  description?: string;

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
  subjectId?: string;

  @IsString()
  @IsOptional()
  academicYearId?: string;

  @IsNumber()
  @IsOptional()
  durationMinutes?: number;

  @IsNumber()
  @IsOptional()
  duration?: number;

  @IsNumber()
  @IsOptional()
  passingScore?: number;

  @IsNumber()
  @IsOptional()
  passingMarks?: number;

  @IsNumber()
  @IsOptional()
  totalScore?: number;

  @IsNumber()
  @IsOptional()
  totalMarks?: number;

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
  @IsOptional()
  questions?: CreateQuestionDto[];
}

export class SubmitExamDto {
  @IsOptional()
  answers?: Record<string, string>; // { questionId: selectedOption }
}

