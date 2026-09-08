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
    return this.prisma.course.create({
      data: {
        tenantId,
        title: dto.title,
        slug: dto.slug.toLowerCase(),
        academicYearId: dto.academicYearId,
        subjectId: dto.subjectId,
        description: dto.description,
        thumbnailUrl: dto.thumbnailUrl,
        price: dto.price || 0,
        isPublished: true,
      },
      include: {
        academicYear: true,
        subject: true,
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

  async getCourses(tenantId: string) {
    return this.prisma.course.findMany({
      where: { tenantId, isPublished: true },
      include: {
        academicYear: true,
        subject: true,
        chapters: {
          include: {
            lessons: {
              select: {
                id: true,
                title: true,
                durationSeconds: true,
                isFreePreview: true,
                orderIndex: true,
                pdfAttachmentUrl: true,
              },
            },
          },
          orderBy: { orderIndex: 'asc' },
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
}
