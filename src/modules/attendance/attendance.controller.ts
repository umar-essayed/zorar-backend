import { Controller, Post, Get, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { ScanAttendanceDto, BatchOfflineSyncDto, RecordSessionAssessmentDto } from './dto/scan-qr.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('api/v1/attendance')
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('scan')
  scan(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') assistantId: string,
    @Body() dto: ScanAttendanceDto,
  ) {
    return this.attendanceService.scanAttendance(tenantId, assistantId, dto);
  }

  @Post('assessment')
  recordAssessment(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') assistantId: string,
    @Body() dto: RecordSessionAssessmentDto,
  ) {
    return this.attendanceService.recordAssessment(tenantId, assistantId, dto);
  }

  @Post('record-absence')
  recordAbsence(
    @CurrentTenant() tenantId: string,
    @Body('studentId') studentId: string,
    @Body('groupId') groupId: string,
  ) {
    return this.attendanceService.recordAbsence(tenantId, studentId, groupId);
  }

  @Post('batch-sync')
  batchSync(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') assistantId: string,
    @Body() dto: BatchOfflineSyncDto,
  ) {
    return this.attendanceService.batchSyncOffline(tenantId, assistantId, dto);
  }

  @Get('group/:groupId')
  getGroupAttendance(
    @CurrentTenant() tenantId: string,
    @Param('groupId') groupId: string,
    @Query('date') date?: string,
  ) {
    return this.attendanceService.getGroupAttendance(tenantId, groupId, date);
  }
}
