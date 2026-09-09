import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AcademicService } from './academic.service';
import { CreateAcademicYearDto, CreateSubjectDto, CreateClassroomDto, CreateGroupDto } from './dto/create-group.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('api/v1/academic')
@UseGuards(JwtAuthGuard)
export class AcademicController {
  constructor(private readonly academicService: AcademicService) {}

  // السنوات الدراسية
  @Post('years')
  createYear(@CurrentTenant() tenantId: string, @Body() dto: CreateAcademicYearDto) {
    return this.academicService.createYear(tenantId, dto);
  }

  @Get('years')
  getYears(@CurrentTenant() tenantId: string) {
    return this.academicService.getYears(tenantId);
  }

  @Post('sync-stages')
  syncStages(@CurrentTenant() tenantId: string, @Body('stages') stages: string[]) {
    return this.academicService.syncStages(tenantId, stages || []);
  }

  // المواد
  @Post('subjects')
  createSubject(@CurrentTenant() tenantId: string, @Body() dto: CreateSubjectDto) {
    return this.academicService.createSubject(tenantId, dto);
  }

  @Get('subjects')
  getSubjects(@CurrentTenant() tenantId: string) {
    return this.academicService.getSubjects(tenantId);
  }

  // القاعات
  @Post('classrooms')
  createClassroom(@CurrentTenant() tenantId: string, @Body() dto: CreateClassroomDto) {
    return this.academicService.createClassroom(tenantId, dto);
  }

  @Get('classrooms')
  getClassrooms(@CurrentTenant() tenantId: string) {
    return this.academicService.getClassrooms(tenantId);
  }

  // المجموعات
  @Post('groups')
  createGroup(@CurrentTenant() tenantId: string, @Body() dto: CreateGroupDto) {
    return this.academicService.createGroup(tenantId, dto);
  }

  @Get('groups')
  getGroups(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Query('teacherId') teacherId?: string,
  ) {
    const effectiveTeacherId = user?.role === 'TEACHER' ? user?.teacherId : teacherId;
    return this.academicService.getGroups(tenantId, effectiveTeacherId);
  }

  @Get('groups/:id')
  getGroupById(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.academicService.getGroupById(tenantId, id);
  }

  @Get('groups/:id/analytics')
  getGroupAnalytics(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.academicService.getGroupAnalytics(tenantId, id);
  }

  @Get('groups/:id/sessions')
  getGroupSessions(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.academicService.getGroupSessions(tenantId, id);
  }

  @Post('groups/:id/sessions/generate')
  generateGroupSessions(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body('count') count?: number,
    @Body('startDate') startDate?: string,
  ) {
    return this.academicService.generateSessionsForGroup(tenantId, id, count, startDate);
  }

  @Put('groups/:id/sessions/:sessionId')
  rescheduleGroupSession(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: any,
  ) {
    return this.academicService.rescheduleGroupSession(tenantId, id, sessionId, dto);
  }

  @Put('groups/:id')
  updateGroup(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: any) {
    return this.academicService.updateGroup(tenantId, id, dto);
  }

  @Delete('groups/:id')
  deleteGroup(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.academicService.deleteGroup(tenantId, id);
  }

  @Put('years/:id')
  updateYear(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: { name?: string; orderIndex?: number },
  ) {
    return this.academicService.updateYear(tenantId, id, dto);
  }

  @Delete('years/:id')
  deleteYear(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.academicService.deleteYear(tenantId, id);
  }

  @Put('subjects/:id')
  updateSubject(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: { name?: string; code?: string },
  ) {
    return this.academicService.updateSubject(tenantId, id, dto);
  }

  @Delete('subjects/:id')
  deleteSubject(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.academicService.deleteSubject(tenantId, id);
  }

  @Post('groups/:id/emergency-session')
  openEmergencySession(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: { sessionNumber?: number; title?: string; reason?: string; date?: string },
  ) {
    return this.academicService.openEmergencySession(tenantId, id, dto);
  }
}

