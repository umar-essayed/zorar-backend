import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { TeachersService } from './teachers.service';
import { CreateTeacherDto, CreateTeacherPayoutDto } from './dto/create-teacher.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('api/v1/teachers')
@UseGuards(JwtAuthGuard)
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  @Post()
  createTeacher(@CurrentTenant() tenantId: string, @Body() dto: CreateTeacherDto) {
    return this.teachersService.createTeacher(tenantId, dto);
  }

  @Get()
  getTeachers(@CurrentTenant() tenantId: string) {
    return this.teachersService.getTeachers(tenantId);
  }

  @Get(':id')
  getTeacherById(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.teachersService.getTeacherById(tenantId, id);
  }

  @Put(':id')
  updateTeacher(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: any) {
    return this.teachersService.updateTeacher(tenantId, id, dto);
  }

  @Delete(':id')
  deleteTeacher(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.teachersService.deleteTeacher(tenantId, id);
  }

  @Get(':id/dashboard-stats')
  getTeacherDashboardStats(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.teachersService.getTeacherDashboardStats(tenantId, id);
  }

  @Get('portal/stats')
  getTeacherPortalStats(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.teachersService.getTeacherDashboardStats(tenantId, userId);
  }
}

