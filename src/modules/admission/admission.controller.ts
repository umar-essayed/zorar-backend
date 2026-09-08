import { Controller, Post, Get, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AdmissionService } from './admission.service';
import { CreateAdmissionFormDto, SubmitAdmissionDto } from './dto/submit-admission.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@Controller('api/v1/admission')
export class AdmissionController {
  constructor(private readonly admissionService: AdmissionService) {}

  @Post('forms')
  @UseGuards(JwtAuthGuard)
  createForm(@CurrentTenant() tenantId: string, @Body() dto: CreateAdmissionFormDto) {
    return this.admissionService.createForm(tenantId, dto);
  }

  @Get('forms/current')
  @UseGuards(JwtAuthGuard)
  getCurrentForm(@CurrentTenant() tenantId: string) {
    return this.admissionService.getOrCreateDefaultForm(tenantId);
  }

  @Put('forms/:id/toggle')
  @UseGuards(JwtAuthGuard)
  toggleForm(@CurrentTenant() tenantId: string, @Param('id') formId: string) {
    return this.admissionService.toggleForm(tenantId, formId);
  }

  // جلب الاستمارة العامة والسنوات والمجموعات عبر اسم السنتر أو النطاق الفرعي
  @Get('public-slug/:slug')
  getPublicFormBySlug(@Param('slug') slug: string) {
    return this.admissionService.getPublicFormBySlug(slug);
  }

  // نقطة عامة للطلاب وأولياء الأمور لجلب استمارة الحجز
  @Get('public/:subdomain/:slug')
  getPublicForm(
    @Param('subdomain') subdomain: string,
    @Param('slug') slug: string,
  ) {
    return this.admissionService.getPublicForm(subdomain, slug);
  }

  // نقطة عامة لتقديم طلب الحجز
  @Post('public/:formId/submit')
  submitApplication(
    @Param('formId') formId: string,
    @Body() dto: SubmitAdmissionDto,
  ) {
    return this.admissionService.submitApplication(formId, dto);
  }

  @Get('submissions')
  @UseGuards(JwtAuthGuard)
  getSubmissions(@CurrentTenant() tenantId: string, @Query('formId') formId?: string) {
    return this.admissionService.getSubmissions(tenantId, formId);
  }

  @Post('submissions/:id/approve')
  @UseGuards(JwtAuthGuard)
  approveSubmission(
    @CurrentTenant() tenantId: string,
    @Param('id') submissionId: string,
    @Body('academicYearId') academicYearId: string,
    @Body('groupIds') groupIds?: string[],
  ) {
    return this.admissionService.approveSubmission(tenantId, submissionId, academicYearId, groupIds);
  }

  @Post('submissions/:id/reject')
  @UseGuards(JwtAuthGuard)
  rejectSubmission(
    @CurrentTenant() tenantId: string,
    @Param('id') submissionId: string,
    @Body('reason') reason?: string,
  ) {
    return this.admissionService.rejectSubmission(tenantId, submissionId, reason);
  }

  @Delete('submissions/:id')
  @UseGuards(JwtAuthGuard)
  deleteSubmission(
    @CurrentTenant() tenantId: string,
    @Param('id') submissionId: string,
  ) {
    return this.admissionService.deleteSubmission(tenantId, submissionId);
  }
}
