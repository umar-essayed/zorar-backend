import { IsString, IsNotEmpty, IsArray, IsNumber, IsOptional } from 'class-validator';

export class CreateAcademicYearDto {
  @IsString()
  @IsNotEmpty({ message: 'اسم السنة الدراسية مطلوب' })
  name: string;
}

export class CreateSubjectDto {
  @IsString()
  @IsNotEmpty({ message: 'اسم المادة مطلوب' })
  name: string;

  @IsString()
  @IsOptional()
  code?: string;
}

export class CreateClassroomDto {
  @IsString()
  @IsNotEmpty({ message: 'اسم القاعة مطلوب' })
  name: string;

  @IsNumber()
  @IsOptional()
  capacity?: number;
}

export class CreateGroupDto {
  @IsString()
  @IsNotEmpty({ message: 'اسم المجموعة مطلوب' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'معرف السنة الدراسية مطلوب' })
  academicYearId: string;

  @IsString()
  @IsNotEmpty({ message: 'معرف المادة مطلوب' })
  subjectId: string;

  @IsString()
  @IsOptional()
  teacherId?: string;

  @IsString()
  @IsOptional()
  classroomId?: string;

  @IsArray()
  dayOfWeek: number[]; // 0-6

  @IsString()
  @IsNotEmpty({ message: 'توقيت بدء الحصة مطلوب' })
  startTime: string;

  @IsString()
  @IsNotEmpty({ message: 'توقيت انتهاء الحصة مطلوب' })
  endTime: string;

  @IsNumber()
  @IsOptional()
  pricePerSession?: number;

  @IsNumber()
  @IsOptional()
  sessionPrice?: number;

  @IsNumber()
  @IsOptional()
  monthlyFee?: number;

  @IsNumber()
  @IsOptional()
  monthlyPrice?: number;

  @IsNumber()
  @IsOptional()
  maxStudents?: number;

  @IsNumber()
  @IsOptional()
  capacity?: number;

  @IsNumber()
  @IsOptional()
  sessionsPerMonth?: number;

  @IsNumber()
  @IsOptional()
  gracePeriodMinutes?: number;

  @IsNumber()
  @IsOptional()
  allowedGraceSessions?: number;

  @IsString()
  @IsOptional()
  startDate?: string;
}
