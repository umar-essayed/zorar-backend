import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateExamDto, SubmitExamDto } from './dto/create-exam.dto';

@Injectable()
export class ExamsService {
  constructor(private prisma: PrismaService) {}

  async createExam(tenantId: string, dto: CreateExamDto) {
    const totalScore = dto.questions.reduce((sum, q) => sum + (q.points || 1), 0);

    return this.prisma.exam.create({
      data: {
        tenantId,
        courseId: dto.courseId || null,
        title: dto.title,
        durationMinutes: dto.durationMinutes,
        passingScore: dto.passingScore || Math.floor(totalScore * 0.5),
        totalScore,
        shuffleQuestions: dto.shuffleQuestions !== undefined ? dto.shuffleQuestions : true,
        isPublished: true,
        questions: {
          create: dto.questions.map((q) => ({
            text: q.text,
            imageUrl: q.imageUrl,
            points: q.points || 1,
            options: q.options,
            correctOption: q.correctOption,
            explanation: q.explanation,
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

    if (!exam) throw new NotFoundException('الامتحان غير متاح');

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

    // التحقق هل سلّم الطالب هذا الامتحان مسبقاً
    const existingSubmission = await this.prisma.examSubmission.findFirst({
      where: { examId, studentId },
    });
    if (existingSubmission) {
      throw new BadRequestException('لقد قمت بتسليم هذا الامتحان بالفعل');
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
      percentage: Math.round((calculatedScore / exam.totalScore) * 100),
      passed,
      review: exam.showModelAnswers ? reviewDetails : null,
    };
  }

  async getExamsByTenant(tenantId: string) {
    return this.prisma.exam.findMany({
      where: { tenantId },
      include: {
        _count: { select: { questions: true, submissions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getExamById(tenantId: string, examId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, tenantId },
      include: {
        questions: true,
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
      totalScore = dto.questions.reduce((sum, q) => sum + (q.points || 1), 0);
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.questions && dto.questions.length > 0) {
        await tx.question.deleteMany({ where: { examId } });
        await tx.question.createMany({
          data: dto.questions.map((q) => ({
            examId,
            text: q.text,
            imageUrl: q.imageUrl,
            points: q.points || 1,
            options: q.options as any,
            correctOption: q.correctOption,
            explanation: q.explanation,
          })),
        });
      }

      return tx.exam.update({
        where: { id: examId },
        data: {
          ...(dto.title ? { title: dto.title } : {}),
          ...(dto.courseId !== undefined ? { courseId: dto.courseId } : {}),
          ...(dto.durationMinutes ? { durationMinutes: dto.durationMinutes } : {}),
          ...(dto.passingScore ? { passingScore: dto.passingScore } : {}),
          ...(dto.shuffleQuestions !== undefined ? { shuffleQuestions: dto.shuffleQuestions } : {}),
          totalScore,
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
