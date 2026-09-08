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
  courseId?: string;

  @IsNumber()
  durationMinutes: number;

  @IsNumber()
  @IsOptional()
  passingScore?: number;

  @IsBoolean()
  @IsOptional()
  shuffleQuestions?: boolean;

  @IsArray()
  questions: CreateQuestionDto[];
}

export class SubmitExamDto {
  @IsNotEmpty()
  answers: Record<string, string>; // { questionId: selectedOption }
}
