import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateCourseDto, CreateChapterDto, CreateLessonDto } from './dto/create-course.dto';

@Injectable()
export class CoursesService {
  private readonly secretKey: Buffer;

  constructor(private prisma: PrismaService) {
    const rawKey = process.env.YOUTUBE_AES_SECRET_KEY || 'zorar-secure-aes-video-key-32ch';
    // التأكد من أن طول المفتاح 32 بايت لـ AES-256
    this.secretKey = crypto.createHash('sha256').update(rawKey).digest();
  }

  // دالة تشفير كود اليوتيوب وتخزينه في الداتابيز
  encryptVideoId(rawId: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.secretKey, iv);
    let encrypted = cipher.update(rawId, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  // دالة فك التشفير الآمنة الداخلية
  private decryptVideoId(encryptedPayload: string): string {
    const [ivHex, encryptedText] = encryptedPayload.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.secretKey, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  async createCourse(tenantId: string, dto: CreateCourseDto) {
    const rawSlug = dto.slug?.trim() || `course-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const cleanSlug = rawSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');

    return this.prisma.course.create({
      data: {
        tenantId,
        title: dto.title,
        slug: cleanSlug,
        academicYearId: dto.academicYearId,
        subjectId: dto.subjectId,
        teacherId: dto.teacherId || null,
        description: dto.description || null,
        thumbnailUrl: dto.thumbnailUrl || null,
        price: dto.price || 0,
        isPublished: dto.isPublished !== undefined ? dto.isPublished : true,
      },
      include: {
        academicYear: true,
        subject: true,
        teacher: true,
      },
    });
  }

  async addChapter(courseId: string, dto: CreateChapterDto) {
    return this.prisma.chapter.create({
      data: {
        courseId,
        title: dto.title,
        orderIndex: dto.orderIndex || 0,
      },
    });
  }

  async addLesson(chapterId: string, dto: CreateLessonDto) {
    const encryptedVideoId = this.encryptVideoId(dto.rawYouTubeId);

    return this.prisma.lesson.create({
      data: {
        chapterId,
        title: dto.title,
        encryptedVideoId,
        durationSeconds: dto.durationSeconds || 0,
        isFreePreview: dto.isFreePreview || false,
        pdfAttachmentUrl: dto.pdfAttachmentUrl,
        homeworkDetails: dto.homeworkDetails,
        orderIndex: dto.orderIndex || 0,
      },
    });
  }

  async updateLesson(lessonId: string, dto: Partial<CreateLessonDto>) {
    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.rawYouTubeId !== undefined && dto.rawYouTubeId.trim()) {
      data.encryptedVideoId = this.encryptVideoId(dto.rawYouTubeId.trim());
    }
    if (dto.durationSeconds !== undefined) data.durationSeconds = dto.durationSeconds;
    if (dto.isFreePreview !== undefined) data.isFreePreview = dto.isFreePreview;
    if (dto.pdfAttachmentUrl !== undefined) data.pdfAttachmentUrl = dto.pdfAttachmentUrl;
    if (dto.homeworkDetails !== undefined) data.homeworkDetails = dto.homeworkDetails;
    if (dto.orderIndex !== undefined) data.orderIndex = dto.orderIndex;

    return this.prisma.lesson.update({
      where: { id: lessonId },
      data,
    });
  }

  async deleteLesson(lessonId: string) {
    return this.prisma.lesson.delete({
      where: { id: lessonId },
    });
  }

  async updateChapter(chapterId: string, dto: Partial<CreateChapterDto>) {
    return this.prisma.chapter.update({
      where: { id: chapterId },
      data: {
        ...(dto.title ? { title: dto.title } : {}),
        ...(dto.orderIndex !== undefined ? { orderIndex: dto.orderIndex } : {}),
      },
    });
  }

  async deleteChapter(chapterId: string) {
    return this.prisma.chapter.delete({
      where: { id: chapterId },
    });
  }

  async reorderLessons(chapterId: string, lessonIds: string[]) {
    const updates = lessonIds.map((id, index) =>
      this.prisma.lesson.update({
        where: { id },
        data: { orderIndex: index },
      }),
    );
    return this.prisma.$transaction(updates);
  }

  async getCourseById(tenantId: string, courseId: string) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, tenantId },
      include: {
        academicYear: true,
        subject: true,
        teacher: true,
        chapters: {
          include: {
            lessons: {
              orderBy: { orderIndex: 'asc' },
            },
          },
          orderBy: { orderIndex: 'asc' },
        },
        exams: {
          include: {
            questions: true,
            _count: { select: { submissions: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!course) throw new NotFoundException('الكورس غير موجود');
    return course;
  }

  async getCourses(
    tenantId: string,
    filters?: { subjectId?: string; academicYearId?: string; teacherId?: string; search?: string },
  ) {
    return this.prisma.course.findMany({
      where: {
        tenantId,
        ...(filters?.subjectId ? { subjectId: filters.subjectId } : {}),
        ...(filters?.academicYearId ? { academicYearId: filters.academicYearId } : {}),
        ...(filters?.teacherId ? { teacherId: filters.teacherId } : {}),
        ...(filters?.search
          ? {
              OR: [
                { title: { contains: filters.search, mode: 'insensitive' } },
                { description: { contains: filters.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        academicYear: true,
        subject: true,
        teacher: true,
        chapters: {
          include: {
            lessons: {
              select: {
                id: true,
                title: true,
                durationSeconds: true,
                isFreePreview: true,
                orderIndex: true,
              },
            },
          },
          orderBy: { orderIndex: 'asc' },
        },
        _count: {
          select: { chapters: true, exams: true, enrollments: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getLessonSecurePlayerToken(studentId: string, tenantId: string, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { chapter: { include: { course: true } } },
    });

    if (!lesson) throw new NotFoundException('الدرس غير موجود');

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
    });
    if (!student) throw new NotFoundException('الطالب غير مسجل');

    // إذا لم يكن الدرس متاحاً للمعاينة المجانية، نتحقق من فتح الكورس للطالب
    if (!lesson.isFreePreview) {
      const enrollment = await this.prisma.studentCourseEnrollment.findUnique({
        where: {
          studentId_courseId: {
            studentId,
            courseId: lesson.chapter.courseId,
          },
        },
      });

      if (!enrollment) {
        throw new ForbiddenException('هذا الدرس غير متاح لك. يرجى الاشتراك في الكورس أو سداد حصة السنتر لفتحه.');
      }
    }

    // فك كود الفيديو الخام
    const rawVideoId = this.decryptVideoId(lesson.encryptedVideoId);

    // توليد توكن التشغيل الآمن والبيانات الحية للعلامة المائية المتحركة
    const expiresAt = Date.now() + 60 * 60 * 1000; // صلاحية لمدة ساعة واحدة
    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(`${student.id}:${lesson.id}:${expiresAt}`)
      .digest('hex');

    return {
      playbackToken: signature,
      expiresAt,
      rawVideoId, // يُمرر فقط لمشغل التطبيق المحمي
      lessonTitle: lesson.title,
      pdfAttachmentUrl: lesson.pdfAttachmentUrl,
      // بيانات العلامة المائية العائمة المتحركة التي يقفز بها المشغل كل 5 ثوانٍ:
      watermarkConfig: {
        studentCode: student.studentCode,
        studentName: student.name,
        studentPhone: student.phone,
        intervalSeconds: 5,
        opacity: 0.35,
      },
    };
  }

  async logWatchProgress(studentId: string, lessonId: string, watchedSeconds: number, isCompleted: boolean) {
    return this.prisma.videoWatchLog.upsert({
      where: {
        studentId_lessonId: { studentId, lessonId },
      },
      update: {
        watchedSeconds,
        isCompleted,
        lastWatchedAt: new Date(),
      },
      create: {
        studentId,
        lessonId,
        watchedSeconds,
        isCompleted,
      },
    });
  }

  // إتاحة الكورس لمجموعة أو مجموعات طلابية محلية بالسنتر بنقرة واحدة
  async grantCourseToGroups(tenantId: string, courseId: string, groupIds: string[]) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, tenantId },
    });
    if (!course) throw new NotFoundException('الكورس غير موجود');

    const groups = await this.prisma.group.findMany({
      where: { id: { in: groupIds }, tenantId },
      include: { students: true },
    });
    if (!groups.length) throw new NotFoundException('لم يتم العثور على أي من المجموعات المحددة');

    let totalGrantedCount = 0;
    const groupNames: string[] = [];

    for (const group of groups) {
      groupNames.push(group.name);
      const studentIds = group.students.map((sg) => sg.studentId);
      for (const sId of studentIds) {
        await this.prisma.studentCourseEnrollment.upsert({
          where: {
            studentId_courseId: {
              studentId: sId,
              courseId,
            },
          },
          update: {
            source: `GROUP_GRANT_${group.name}`,
            unlockedAt: new Date(),
          },
          create: {
            studentId: sId,
            courseId,
            source: `GROUP_GRANT_${group.name}`,
            unlockedAt: new Date(),
          },
        });
        totalGrantedCount++;
      }
    }

    return {
      success: true,
      message: `تم ربط وفتح محتوى الكورس لعدد ${totalGrantedCount} طالب في المجموعات (${groupNames.join('، ')}) بنجاح`,
      grantedCount: totalGrantedCount,
      linkedGroups: groupNames,
    };
  }

  async grantCourseToGroup(tenantId: string, courseId: string, groupId: string) {
    return this.grantCourseToGroups(tenantId, courseId, [groupId]);
  }

  // تحليلات المنصة المتقدمة (Platform Analytics)
  async getPlatformAnalytics(tenantId: string, teacherId?: string) {
    const whereCourse: any = { tenantId };
    if (teacherId) whereCourse.teacherId = teacherId;

    const [courses, allEnrollmentsCount, watchLogs, exams] = await Promise.all([
      this.prisma.course.findMany({
        where: whereCourse,
        include: {
          academicYear: { select: { name: true } },
          subject: { select: { name: true } },
          teacher: { select: { name: true } },
          chapters: {
            include: {
              lessons: {
                select: { id: true, title: true, durationSeconds: true },
              },
            },
          },
          enrollments: {
            select: { studentId: true, unlockedAt: true },
          },
          exams: {
            include: {
              submissions: {
                select: {
                  id: true,
                  score: true,
                  student: { select: { name: true, studentCode: true } },
                  submittedAt: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.studentCourseEnrollment.count({
        where: { course: whereCourse },
      }),
      this.prisma.videoWatchLog.findMany({
        where: {
          lesson: {
            chapter: {
              course: whereCourse,
            },
          },
        },
        select: {
          studentId: true,
          lessonId: true,
          watchedSeconds: true,
          isCompleted: true,
          lastWatchedAt: true,
        },
      }),
      this.prisma.exam.findMany({
        where: {
          tenantId,
          ...(teacherId ? { course: { teacherId } } : {}),
        },
        include: {
          course: { select: { title: true } },
          questions: { select: { id: true } },
          submissions: {
            include: {
              student: { select: { name: true, studentCode: true } },
            },
            orderBy: { submittedAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // الإحصائيات العامة
    const uniqueStudents = new Set<string>();
    courses.forEach((c) => c.enrollments.forEach((e) => uniqueStudents.add(e.studentId)));

    const activeWatchers = new Set<string>();
    let totalWatchedSeconds = 0;
    let completedLessonsCount = 0;
    watchLogs.forEach((w) => {
      activeWatchers.add(w.studentId);
      totalWatchedSeconds += w.watchedSeconds;
      if (w.isCompleted) completedLessonsCount++;
    });

    let totalLessonsCount = 0;
    courses.forEach((c) => {
      c.chapters.forEach((ch) => {
        totalLessonsCount += ch.lessons.length;
      });
    });

    let totalExamSubmissions = 0;
    let totalExamScoresSum = 0;
    let totalPassedSubmissions = 0;
    exams.forEach((ex) => {
      const passing = Number(ex.passingScore || 50);
      ex.submissions.forEach((sub) => {
        totalExamSubmissions++;
        totalExamScoresSum += Number(sub.score || 0);
        if (Number(sub.score || 0) >= passing) totalPassedSubmissions++;
      });
    });

    const averageQuizScore = totalExamSubmissions > 0
      ? Math.round((totalExamScoresSum / totalExamSubmissions) * 10) / 10
      : 0;
    const overallPassRate = totalExamSubmissions > 0
      ? Math.round((totalPassedSubmissions / totalExamSubmissions) * 100)
      : 0;

    // تفاصيل الكورسات
    const coursesAnalytics = courses.map((c) => {
      const courseLessons = c.chapters.flatMap((ch) => ch.lessons);
      const lessonIds = new Set(courseLessons.map((l) => l.id));
      const courseWatchLogs = watchLogs.filter((w) => lessonIds.has(w.lessonId));
      const activeInCourse = new Set(courseWatchLogs.map((w) => w.studentId)).size;
      const enrolled = c.enrollments.length;

      let courseSubmissions = 0;
      let courseScoresSum = 0;
      c.exams.forEach((ex) => {
        ex.submissions.forEach((s) => {
          courseSubmissions++;
          courseScoresSum += Number(s.score || 0);
        });
      });

      return {
        id: c.id,
        title: c.title,
        price: Number(c.price),
        thumbnailUrl: c.thumbnailUrl,
        academicYearName: c.academicYear?.name ?? '',
        subjectName: c.subject?.name ?? '',
        teacherName: c.teacher?.name ?? '',
        isPublished: c.isPublished,
        enrolledCount: enrolled,
        activeStudentsCount: activeInCourse,
        totalLessons: courseLessons.length,
        totalQuizzes: c.exams.length,
        quizSubmissionsCount: courseSubmissions,
        averageQuizScore: courseSubmissions > 0 ? Math.round((courseScoresSum / courseSubmissions) * 10) / 10 : 0,
        completionRate: enrolled > 0 && courseLessons.length > 0
          ? Math.min(100, Math.round((courseWatchLogs.filter((w) => w.isCompleted).length / (enrolled * courseLessons.length)) * 100))
          : 0,
      };
    });

    // تفاصيل الكويزات
    const quizzesAnalytics = exams.map((ex) => {
      const subs = ex.submissions;
      const subCount = subs.length;
      const passing = Number(ex.passingScore || 50);
      let highest = 0;
      let lowest = subCount > 0 ? 100 : 0;
      let totalScore = 0;
      let passed = 0;

      subs.forEach((s) => {
        const sc = Number(s.score || 0);
        totalScore += sc;
        if (sc > highest) highest = sc;
        if (sc < lowest) lowest = sc;
        if (sc >= passing) passed++;
      });

      return {
        id: ex.id,
        title: ex.title,
        courseTitle: ex.course?.title ?? 'كورس عام',
        totalQuestions: ex.questions.length,
        passingScore: passing,
        submissionsCount: subCount,
        averageScore: subCount > 0 ? Math.round((totalScore / subCount) * 10) / 10 : 0,
        passRate: subCount > 0 ? Math.round((passed / subCount) * 100) : 0,
        highestScore: highest,
        lowestScore: subCount > 0 ? lowest : 0,
        recentSubmissions: subs.slice(0, 10).map((s) => ({
          studentName: s.student.name,
          studentCode: s.student.studentCode,
          score: Number(s.score || 0),
          isPassed: Number(s.score || 0) >= passing,
          submittedAt: s.submittedAt,
        })),
      };
    });

    return {
      overview: {
        totalCourses: courses.length,
        totalLessons: totalLessonsCount,
        totalRegisteredStudents: uniqueStudents.size,
        totalEnrollments: allEnrollmentsCount,
        activeWatchersCount: activeWatchers.size,
        totalWatchHours: Math.round((totalWatchedSeconds / 3600) * 10) / 10,
        completedLessonsCount,
        totalQuizzes: exams.length,
        totalQuizSubmissions: totalExamSubmissions,
        averageQuizScore,
        overallPassRate,
      },
      courses: coursesAnalytics,
      quizzes: quizzesAnalytics,
    };
  }
}

