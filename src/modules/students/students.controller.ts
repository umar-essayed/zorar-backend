import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { StudentsService } from './students.service';
import { CreateStudentDto, BatchImportStudentsDto } from './dto/create-student.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('api/v1/students')
@UseGuards(JwtAuthGuard)
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Post()
  createStudent(@CurrentTenant() tenantId: string, @Body() dto: CreateStudentDto) {
    return this.studentsService.createStudent(tenantId, dto);
  }

  @Post('batch-import')
  batchImport(@CurrentTenant() tenantId: string, @Body() dto: BatchImportStudentsDto) {
    return this.studentsService.batchImport(tenantId, dto);
  }

  @Get()
  getStudents(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Query('search') search?: string,
    @Query('groupId') groupId?: string,
    @Query('teacherId') teacherId?: string,
  ) {
    const effectiveTeacherId = user?.role === 'TEACHER' ? user?.teacherId : teacherId;
    return this.studentsService.getStudents(tenantId, search, groupId, effectiveTeacherId);
  }

  @Get(':id')
  getStudentById(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.studentsService.getStudentById(tenantId, id);
  }

  @Get(':id/profile')
  getStudentProfile(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.studentsService.getStudentProfile(tenantId, id);
  }

  @Post(':id/enroll')
  enrollInGroup(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: { groupId: string; discountPercent?: number; initialMonthPaid?: boolean },
  ) {
    return this.studentsService.enrollInGroup(tenantId, id, dto);
  }

  @Post(':id/unenroll')
  unenrollFromGroup(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body('groupId') groupId: string,
  ) {
    return this.studentsService.unenrollFromGroup(tenantId, id, groupId);
  }

  @Post(':id/pay')
  recordPayment(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') assistantId: string,
    @Param('id') id: string,
    @Body()
    dto: {
      groupId?: string;
      monthNumber?: number;
      amount: number;
      type: 'MONTHLY_SUBSCRIPTION' | 'LESSON_SESSION_FEE';
      method?: 'CASH' | 'VODAFONE_CASH' | 'INSTAPAY' | 'CREDIT_CARD';
      description?: string;
    },
  ) {
    return this.studentsService.recordStudentPayment(tenantId, assistantId, id, dto);
  }

  @Put(':id')
  updateStudent(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: any) {
    return this.studentsService.updateStudent(tenantId, id, dto);
  }

  @Delete(':id')
  deleteStudent(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.studentsService.deleteStudent(tenantId, id);
  }

  @Get(':id/card-qr')
  getCardQR(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.studentsService.getStudentCardQRBase64(tenantId, id);
  }

  @Get(':id/groups/:groupId/analytics')
  getGroupAnalytics(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Param('groupId') groupId: string,
  ) {
    return this.studentsService.getGroupAnalytics(tenantId, id, groupId);
  }
}

