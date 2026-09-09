import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateExamDto, SubmitExamDto } from './dto/create-exam.dto';

@Injectable()
export class ExamsService {
  constructor(private prisma: PrismaService) {}

  async createExam(tenantId: string, dto: CreateExamDto) {
    const rawQuestions = dto.questions || [];
    const totalScore = dto.totalScore ?? dto.totalMarks ?? (rawQuestions.length > 0 ? rawQuestions.reduce((sum, q) => sum + (Number(q.points) || 1), 0) : 100);
    const availableFrom = dto.availableFrom ? new Date(dto.availableFrom) : null;
    const availableUntil = dto.availableUntil ? new Date(dto.availableUntil) : null;
    const durationMinutes = dto.durationMinutes ?? dto.duration ?? 30;
    const passingScore = dto.passingScore ?? dto.passingMarks ?? Math.floor(totalScore * 0.5);

    return this.prisma.exam.create({
      data: {
        tenantId,
        courseId: dto.courseId || null,
        groupId: dto.groupId || null,
        groupIds: dto.groupIds ? (dto.groupIds as any) : (dto.groupId ? [dto.groupId] as any : null),
        teacherId: dto.teacherId || null,
        academicYearId: dto.academicYearId || null,
        title: dto.title,
        instructions: dto.instructions || dto.description || null,
        durationMinutes: Math.round(durationMinutes),
        passingScore: Math.round(passingScore),
        totalScore: Math.round(totalScore),
        maxAttempts: dto.maxAttempts ? Math.round(dto.maxAttempts) : 1,
        availableFrom,
        availableUntil,
        shuffleQuestions: dto.shuffleQuestions !== undefined ? dto.shuffleQuestions : true,
        showModelAnswers: dto.showModelAnswers !== undefined ? dto.showModelAnswers : true,
        isPublished: dto.isPublished !== undefined ? dto.isPublished : true,
        questions: {
          create: rawQuestions.map((q) => ({
            text: q.text,
            imageUrl: q.imageUrl || null,
            points: q.points ? Math.round(Number(q.points)) : 1,
            options: q.options as any,
            correctOption: q.correctOption || q.correctAnswer || 'A',
            explanation: q.explanation || null,
          })),
        },
      },
      include: {
        questions: true,
      },
    });
  }

  async getExamForStudent(tenantId: string, examId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, tenantId, isPublished: true },
      include: {
        questions: {
          select: {
            id: true,
            text: true,
            imageUrl: true,
            points: true,
            options: true, // حجب الإجابة الصحيحة منعاً للغش عبر الـ Network Inspect
          },
        },
      },
    });

    if (!exam) throw new NotFoundException('الامتحان غير متاح أو غير منشور');

    const now = new Date();
    if (exam.availableFrom && now < new Date(exam.availableFrom)) {
      throw new BadRequestException(`الامتحان غير متاح حالياً، سيبدأ في: ${new Date(exam.availableFrom).toLocaleString('ar-EG')}`);
    }
    if (exam.availableUntil && now > new Date(exam.availableUntil)) {
      throw new BadRequestException(`انتهت فترة إتاحة هذا الامتحان في: ${new Date(exam.availableUntil).toLocaleString('ar-EG')}`);
    }

    // راندومة الأسئلة إذا كانت الميزة مفعلة
    if (exam.shuffleQuestions) {
      exam.questions = exam.questions.sort(() => Math.random() - 0.5);
    }

    return exam;
  }

  async submitExam(studentId: string, examId: string, dto: SubmitExamDto) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: { questions: true },
    });

    if (!exam) throw new NotFoundException('الامتحان غير موجود');

    // التحقق من تاريخ إتاحة الامتحان
    const now = new Date();
    if (exam.availableUntil && now > new Date(exam.availableUntil)) {
      throw new BadRequestException('عذراً، انتهت المهلة الزمنية لإتاحة هذا الامتحان');
    }

    // التحقق من عدد المحاولات السابقة للطالب
    const submissionsCount = await this.prisma.examSubmission.count({
      where: { examId, studentId },
    });
    if (submissionsCount >= (exam.maxAttempts || 1)) {
      throw new BadRequestException(`لقد استنفدت الحد الأقصى للمحاولات المسموحة (${exam.maxAttempts || 1} محاولة)`);
    }

    let calculatedScore = 0;
    const reviewDetails: Record<string, any> = {};

    for (const question of exam.questions) {
      const studentAnswer = dto.answers[question.id];
      const isCorrect = studentAnswer === question.correctOption;

      if (isCorrect) {
        calculatedScore += question.points;
      }

      reviewDetails[question.id] = {
        questionText: question.text,
        studentAnswer,
        correctAnswer: question.correctOption,
        isCorrect,
        pointsAwarded: isCorrect ? question.points : 0,
        explanation: question.explanation,
      };
    }

    const submission = await this.prisma.examSubmission.create({
      data: {
        examId,
        studentId,
        score: calculatedScore,
        total: exam.totalScore,
        answers: dto.answers,
      },
    });

    // مكافأة الطالب بالنقاط عند النجاح (Gamification)
    const passed = calculatedScore >= exam.passingScore;
    if (passed) {
      await this.prisma.student.update({
        where: { id: studentId },
        data: { points: { increment: 10 } },
      });
    }

    return {
      submissionId: submission.id,
      score: calculatedScore,
      total: exam.totalScore,
      percentage: Math.round((calculatedScore / (exam.totalScore || 1)) * 100),
      passed,
      review: exam.showModelAnswers ? reviewDetails : null,
    };
  }

  async getExamsByTenant(tenantId: string, filter?: any) {
    const where: any = { tenantId };
    if (filter?.groupId) {
      where.OR = [
        { groupId: filter.groupId },
        { groupIds: { array_contains: filter.groupId } },
      ];
    }
    if (filter?.teacherId) where.teacherId = filter.teacherId;
    if (filter?.courseId) where.courseId = filter.courseId;
    if (filter?.academicYearId) where.academicYearId = filter.academicYearId;

    const exams = await this.prisma.exam.findMany({
      where,
      include: {
        _count: { select: { questions: true, submissions: true } },
        questions: { select: { id: true, points: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return exams;
  }

  async getExamById(tenantId: string, examId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, tenantId },
      include: {
        questions: true,
        submissions: {
          include: {
            student: { select: { id: true, name: true, studentCode: true, phone: true } },
          },
          orderBy: { submittedAt: 'desc' },
          take: 50,
        },
        _count: { select: { submissions: true } },
      },
    });
    if (!exam) throw new NotFoundException('الامتحان غير موجود');
    return exam;
  }

  async updateExam(tenantId: string, examId: string, dto: Partial<CreateExamDto>) {
    const existing = await this.prisma.exam.findFirst({
      where: { id: examId, tenantId },
    });
    if (!existing) throw new NotFoundException('الامتحان غير موجود');

    let totalScore = existing.totalScore;
    if (dto.questions && dto.questions.length > 0) {
      totalScore = dto.totalScore ?? dto.totalMarks ?? dto.questions.reduce((sum, q) => sum + (Number(q.points) || 1), 0);
    } else if (dto.totalScore || dto.totalMarks) {
      totalScore = dto.totalScore ?? dto.totalMarks ?? existing.totalScore;
    }

    const durationMinutes = dto.durationMinutes ?? dto.duration;
    const passingScore = dto.passingScore ?? dto.passingMarks;
    const instructions = dto.instructions !== undefined ? dto.instructions : dto.description;

    return this.prisma.$transaction(async (tx) => {
      if (dto.questions && dto.questions.length > 0) {
        await tx.question.deleteMany({ where: { examId } });
        await tx.question.createMany({
          data: dto.questions.map((q) => ({
            examId,
            text: q.text,
            imageUrl: q.imageUrl || null,
            points: q.points ? Math.round(Number(q.points)) : 1,
            options: q.options as any,
            correctOption: q.correctOption || q.correctAnswer || 'A',
            explanation: q.explanation || null,
          })),
        });
      }

      return tx.exam.update({
        where: { id: examId },
        data: {
          ...(dto.title ? { title: dto.title } : {}),
          ...(instructions !== undefined ? { instructions } : {}),
          ...(dto.courseId !== undefined ? { courseId: dto.courseId } : {}),
          ...(dto.groupId !== undefined ? { groupId: dto.groupId } : {}),
          ...(dto.groupIds !== undefined ? { groupIds: dto.groupIds as any } : {}),
          ...(dto.teacherId !== undefined ? { teacherId: dto.teacherId } : {}),
          ...(dto.academicYearId !== undefined ? { academicYearId: dto.academicYearId } : {}),
          ...(durationMinutes !== undefined ? { durationMinutes: Math.round(durationMinutes) } : {}),
          ...(passingScore !== undefined ? { passingScore: Math.round(passingScore) } : {}),
          ...(dto.maxAttempts !== undefined ? { maxAttempts: Math.round(dto.maxAttempts) } : {}),
          ...(dto.availableFrom !== undefined ? { availableFrom: dto.availableFrom ? new Date(dto.availableFrom) : null } : {}),
          ...(dto.availableUntil !== undefined ? { availableUntil: dto.availableUntil ? new Date(dto.availableUntil) : null } : {}),
          ...(dto.shuffleQuestions !== undefined ? { shuffleQuestions: dto.shuffleQuestions } : {}),
          ...(dto.showModelAnswers !== undefined ? { showModelAnswers: dto.showModelAnswers } : {}),
          ...(dto.isPublished !== undefined ? { isPublished: dto.isPublished } : {}),
          totalScore: Math.round(totalScore),
        },
        include: { questions: true },
      });
    });
  }

  async deleteExam(tenantId: string, examId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, tenantId },
    });
    if (!exam) throw new NotFoundException('الامتحان غير موجود');

    return this.prisma.exam.delete({
      where: { id: examId },
    });
  }
}
