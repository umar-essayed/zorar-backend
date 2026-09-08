import { IsString, IsNotEmpty, IsEnum, IsOptional, IsArray, IsNumber, IsBoolean } from 'class-validator';
import { AttendanceStatus, HomeworkStatus } from '@prisma/client';

export class ScanAttendanceDto {
  @IsString()
  @IsNotEmpty({ message: 'كود الـ QR أو كود الطالب مطلوب' })
  identifier: string; // qrPayload أو studentCode

  @IsString()
  @IsNotEmpty({ message: 'معرف المجموعة مطلوب' })
  groupId: string;

  @IsEnum(AttendanceStatus)
  @IsOptional()
  status?: AttendanceStatus;

  @IsBoolean()
  @IsOptional()
  isMakeup?: boolean;

  @IsString()
  @IsOptional()
  originalGroupId?: string;

  @IsString()
  @IsOptional()
  sessionId?: string;

  @IsNumber()
  @IsOptional()
  sessionNumber?: number;

  @IsBoolean()
  @IsOptional()
  forceGrace?: boolean;
}

export class OfflineSyncItemDto {
  @IsString()
  studentCode: string;

  @IsString()
  groupId: string;

  @IsString()
  scannedAt: string; // ISO string

  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;
}

export class BatchOfflineSyncDto {
  @IsArray()
  items: OfflineSyncItemDto[];
}

export class RecordSessionAssessmentDto {
  @IsString()
  @IsNotEmpty({ message: 'معرف الحضور مطلوب' })
  attendanceId: string;

  @IsEnum(HomeworkStatus)
  homeworkStatus: HomeworkStatus;

  @IsNumber()
  @IsOptional()
  quizScore?: number;

  @IsNumber()
  @IsOptional()
  quizTotal?: number;

  @IsString()
  @IsOptional()
  behaviorNotes?: string;

  @IsBoolean()
  @IsOptional()
  sendWhatsAppReport?: boolean;
}
