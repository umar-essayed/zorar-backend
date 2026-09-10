import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ExamsService } from './exams.service';
import { CreateExamDto, SubmitExamDto } from './dto/create-exam.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('api/v1/exams')
@UseGuards(JwtAuthGuard)
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  @Post()
  createExam(@CurrentTenant() tenantId: string, @Body() dto: CreateExamDto) {
    return this.examsService.createExam(tenantId, dto);
  }

  @Get()
  getExams(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Query() query: any,
  ) {
    return this.examsService.getExamsByTenant(tenantId, query, userId);
  }

  @Get(':id')
  getExam(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.examsService.getExamById(tenantId, id);
  }

  @Put(':id')
  updateExam(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: Partial<CreateExamDto>) {
    return this.examsService.updateExam(tenantId, id, dto);
  }

  @Delete(':id')
  deleteExam(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.examsService.deleteExam(tenantId, id);
  }

  @Get(':id/take')
  getExamForStudent(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') studentId: string,
    @Param('id') id: string,
  ) {
    return this.examsService.getExamForStudent(tenantId, id, studentId);
  }

  @Post(':id/submit')
  submitExam(
    @CurrentUser('id') studentId: string,
    @Param('id') examId: string,
    @Body() dto: SubmitExamDto,
  ) {
    return this.examsService.submitExam(studentId, examId, dto);
  }
}
