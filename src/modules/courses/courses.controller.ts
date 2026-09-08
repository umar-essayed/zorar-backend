import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
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

  @Post(':courseId/chapters')
  addChapter(@Param('courseId') courseId: string, @Body() dto: CreateChapterDto) {
    return this.coursesService.addChapter(courseId, dto);
  }

  @Post('chapters/:chapterId/lessons')
  addLesson(@Param('chapterId') chapterId: string, @Body() dto: CreateLessonDto) {
    return this.coursesService.addLesson(chapterId, dto);
  }

  @Get()
  getCourses(
    @CurrentTenant() tenantId: string,
    @Query('subjectId') subjectId?: string,
    @Query('academicYearId') academicYearId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('search') search?: string,
  ) {
    return this.coursesService.getCourses(tenantId, { subjectId, academicYearId, teacherId, search });
  }

  @Post(':courseId/grant-group')
  grantCourseToGroup(
    @CurrentTenant() tenantId: string,
    @Param('courseId') courseId: string,
    @Body('groupId') groupId: string,
  ) {
    return this.coursesService.grantCourseToGroup(tenantId, courseId, groupId);
  }

  // نقطة جلب توكن الفيديو المشفر والعلامة المائية للطالب
  @Get('lessons/:lessonId/secure-play')
  getSecurePlayback(
    @CurrentUser('id') studentId: string,
    @CurrentTenant() tenantId: string,
    @Param('lessonId') lessonId: string,
  ) {
    return this.coursesService.getLessonSecurePlayerToken(studentId, tenantId, lessonId);
  }

  @Post('lessons/:lessonId/watch-progress')
  logProgress(
    @CurrentUser('id') studentId: string,
    @Param('lessonId') lessonId: string,
    @Body('watchedSeconds') watchedSeconds: number,
    @Body('isCompleted') isCompleted: boolean,
  ) {
    return this.coursesService.logWatchProgress(studentId, lessonId, watchedSeconds, isCompleted);
  }
}
