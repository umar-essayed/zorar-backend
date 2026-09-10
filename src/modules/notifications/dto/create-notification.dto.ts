import { IsNotEmpty, IsString, IsOptional, IsEnum, IsBoolean } from 'class-validator';

export enum NotificationTypeDto {
  GENERAL = 'GENERAL',
  EXAM = 'EXAM',
  LESSON = 'LESSON',
  SCHEDULE = 'SCHEDULE',
  URGENT = 'URGENT',
  ANNOUNCEMENT = 'ANNOUNCEMENT',
}

export enum NotificationTargetDto {
  ALL_STUDENTS = 'ALL_STUDENTS',
  GROUP = 'GROUP',
  SPECIFIC_STUDENT = 'SPECIFIC_STUDENT',
}

export class CreateNotificationDto {
  @IsNotEmpty({ message: 'عنوان الإشعار مطلوب' })
  @IsString()
  title: string;

  @IsNotEmpty({ message: 'نص الإشعار مطلوب' })
  @IsString()
  body: string;

  @IsOptional()
  @IsEnum(NotificationTypeDto)
  type?: NotificationTypeDto;

  @IsOptional()
  @IsEnum(NotificationTargetDto)
  target?: NotificationTargetDto;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  actionPayload?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isUrgent?: boolean;
}
