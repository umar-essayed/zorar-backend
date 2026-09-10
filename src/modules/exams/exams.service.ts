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

    const exam = await this.prisma.exam.create({
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

    // إرسال إشعار فوري لطلاب المجموعة عند نشر الامتحان
    try {
      if (exam.isPublished && (exam.groupId || (exam.groupIds && Array.isArray(exam.groupIds) && exam.groupIds.length > 0))) {
        const targetGroupId = exam.groupId || (exam.groupIds as string[])[0];
        await this.prisma.notification.create({
          data: {
            tenantId,
            title: `امتحان جديد: ${exam.title}`,
            body: `تم إتاحة امتحان جديد لمجموعتك (${exam.totalScore} درجة - ${exam.durationMinutes} دقيقة)`,
            type: 'EXAM',
            target: 'GROUP',
            groupId: targetGroupId,
            actionPayload: { screen: 'exam', examId: exam.id, examTitle: exam.title },
          },
        });
      }
    } catch (err) {
      // إشعار غير حاجب للعملية
    }

    return exam;
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

    // توزيع الدرجة بالتساوي وبدقة عادلة على جميع الأسئلة
    const totalQuestionPoints = exam.questions.reduce((acc, q) => acc + (q.points || 1), 0);
    const targetTotalScore = exam.totalScore || 100;

    let rawEarnedPoints = 0;
    const reviewDetailsList: any[] = [];
    const reviewDetailsMap: Record<string, any> = {};
    const safeAnswers = dto?.answers || {};

    for (const question of exam.questions) {
      const studentAnswer = safeAnswers[question.id] || '';
      const isCorrect = studentAnswer === question.correctOption;
      const questionWeight = question.points || 1;

      if (isCorrect) {
        rawEarnedPoints += questionWeight;
      }

      const itemReview = {
        questionId: question.id,
        questionText: question.text,
        studentAnswer,
        correctAnswer: question.correctOption,
        isCorrect,
        pointsAwarded: isCorrect ? questionWeight : 0,
        explanation: question.explanation,
      };

      reviewDetailsList.push(itemReview);
      reviewDetailsMap[question.id] = itemReview;
    }

    const calculatedScore = totalQuestionPoints > 0
      ? Math.round((rawEarnedPoints / totalQuestionPoints) * targetTotalScore)
      : 0;

    const submission = await this.prisma.examSubmission.create({
      data: {
        examId,
        studentId,
        score: calculatedScore,
        total: targetTotalScore,
        answers: safeAnswers,
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
      total: targetTotalScore,
      percentage: Math.round((calculatedScore / (targetTotalScore || 1)) * 100),
      passed,
      review: exam.showModelAnswers ? reviewDetailsList : null,
      reviewMap: exam.showModelAnswers ? reviewDetailsMap : null,
    };
  }

  async getExamsByTenant(tenantId: string, filter?: any, studentId?: string) {
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
        submissions: studentId
          ? {
              where: { studentId },
              select: { id: true, score: true, total: true, submittedAt: true },
              orderBy: { submittedAt: 'desc' },
            }
          : false,
      },
      orderBy: { createdAt: 'desc' },
    });

    return exams.map((exam) => {
      const subs = (exam as any).submissions || [];
      const maxAttempts = exam.maxAttempts || 1;
      const mySubmissionsCount = subs.length;
      const remainingAttempts = Math.max(0, maxAttempts - mySubmissionsCount);
      const isCompleted = mySubmissionsCount >= maxAttempts;
      const lastSubmission = subs[0] || null;

      return {
        ...exam,
        maxAttempts,
        mySubmissionsCount,
        remainingAttempts,
        isCompleted,
        lastScore: lastSubmission ? lastSubmission.score : null,
        lastPercentage:
          lastSubmission && exam.totalScore > 0
            ? Math.round((lastSubmission.score / exam.totalScore) * 100)
            : null,
      };
    });
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
