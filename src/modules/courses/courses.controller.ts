import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CreateCourseDto, CreateChapterDto, CreateLessonDto } from './dto/create-course.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('api/v1/courses')
@UseGuards(JwtAuthGuard)
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Post()
  createCourse(@CurrentTenant() tenantId: string, @Body() dto: CreateCourseDto) {
    return this.coursesService.createCourse(tenantId, dto);
  }

  @Get(':courseId')
  getCourse(@CurrentTenant() tenantId: string, @Param('courseId') courseId: string) {
    return this.coursesService.getCourseById(tenantId, courseId);
  }

  @Post(':courseId/chapters')
  addChapter(@Param('courseId') courseId: string, @Body() dto: CreateChapterDto) {
    return this.coursesService.addChapter(courseId, dto);
  }

  @Put('chapters/:chapterId')
  updateChapter(@Param('chapterId') chapterId: string, @Body() dto: Partial<CreateChapterDto>) {
    return this.coursesService.updateChapter(chapterId, dto);
  }

  @Delete('chapters/:chapterId')
  deleteChapter(@Param('chapterId') chapterId: string) {
    return this.coursesService.deleteChapter(chapterId);
  }

  @Post('chapters/:chapterId/lessons')
  addLesson(@Param('chapterId') chapterId: string, @Body() dto: CreateLessonDto) {
    return this.coursesService.addLesson(chapterId, dto);
  }

  @Put('lessons/:lessonId')
  updateLesson(@Param('lessonId') lessonId: string, @Body() dto: Partial<CreateLessonDto>) {
    return this.coursesService.updateLesson(lessonId, dto);
  }

  @Delete('lessons/:lessonId')
  deleteLesson(@Param('lessonId') lessonId: string) {
    return this.coursesService.deleteLesson(lessonId);
  }

  @Post('chapters/:chapterId/reorder')
  reorderLessons(@Param('chapterId') chapterId: string, @Body('lessonIds') lessonIds: string[]) {
    return this.coursesService.reorderLessons(chapterId, lessonIds || []);
  }

  @Get()
  getCourses(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Query('subjectId') subjectId?: string,
    @Query('academicYearId') academicYearId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('search') search?: string,
  ) {
    const effectiveTeacherId = user?.role === 'TEACHER' ? user?.teacherId : teacherId;
    return this.coursesService.getCourses(tenantId, { subjectId, academicYearId, teacherId: effectiveTeacherId, search });
  }

  @Get('platform/analytics')
  getPlatformAnalytics(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Query('teacherId') teacherId?: string,
  ) {
    const effectiveTeacherId = user?.role === 'TEACHER' ? user?.teacherId : teacherId;
    return this.coursesService.getPlatformAnalytics(tenantId, effectiveTeacherId);
  }

  @Post(':courseId/grant-group')
  grantCourseToGroup(
    @CurrentTenant() tenantId: string,
    @Param('courseId') courseId: string,
    @Body('groupId') groupId?: string,
    @Body('groupIds') groupIds?: string[],
  ) {
    const targetIds = groupIds && groupIds.length ? groupIds : (groupId ? [groupId] : []);
    return this.coursesService.grantCourseToGroups(tenantId, courseId, targetIds);
  }

  @Post(':courseId/grant-groups')
  grantCourseToGroups(
    @CurrentTenant() tenantId: string,
    @Param('courseId') courseId: string,
    @Body('groupIds') groupIds: string[],
  ) {
    return this.coursesService.grantCourseToGroups(tenantId, courseId, groupIds || []);
  }

  @Get(':courseId/granted-groups')
  getGrantedGroups(
    @CurrentTenant() tenantId: string,
    @Param('courseId') courseId: string,
  ) {
    return this.coursesService.getGrantedGroups(tenantId, courseId);
  }


  // نقطة جلب توكن الفيديو المشفر والعلامة المائية للطالب
  @Get('lessons/:lessonId/secure-play')
  @Get('lessons/:lessonId/player-token')
  getSecurePlayback(
    @CurrentUser('id') studentId: string,
    @CurrentTenant() tenantId: string,
    @Param('lessonId') lessonId: string,
  ) {
    return this.coursesService.getLessonSecurePlayerToken(studentId, tenantId, lessonId);
  }

  @Post('lessons/:lessonId/watch-progress')
  @Post('lessons/:lessonId/progress')
  logProgress(
    @CurrentUser('id') studentId: string,
    @Param('lessonId') lessonId: string,
    @Body('watchedSeconds') watchedSeconds: number,
    @Body('isCompleted') isCompleted: boolean,
  ) {
    return this.coursesService.logWatchProgress(studentId, lessonId, watchedSeconds, isCompleted);
  }
}
