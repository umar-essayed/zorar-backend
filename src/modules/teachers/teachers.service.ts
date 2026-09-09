import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateTeacherDto, CreateTeacherPayoutDto } from './dto/create-teacher.dto';

@Injectable()
export class TeachersService {
  constructor(private prisma: PrismaService) {}

  async createTeacher(tenantId: string, dto: CreateTeacherDto) {
    let subjectId = dto.subjectId;

    if (!subjectId || subjectId.trim() === '') {
      let existingSubject = await this.prisma.subject.findFirst({
        where: { tenantId },
      });
      if (!existingSubject) {
        existingSubject = await this.prisma.subject.create({
          data: {
            tenantId,
            name: 'عام / مادة أساسية',
            code: 'GEN-01',
          },
        });
      }
      subjectId = existingSubject.id;
    } else {
      const existingSubject = await this.prisma.subject.findFirst({
        where: { id: subjectId, tenantId },
      });
      if (!existingSubject) {
        let fallback = await this.prisma.subject.findFirst({ where: { tenantId } });
        if (!fallback) {
          fallback = await this.prisma.subject.create({
            data: {
              tenantId,
              name: 'عام / مادة أساسية',
              code: 'GEN-01',
            },
          });
        }
        subjectId = fallback.id;
      }
    }

    let centerPercentage = dto.centerPercentage !== undefined ? dto.centerPercentage : 20.0;
    let fixedCenterFee = dto.fixedCenterFee || 0.0;

    if (dto.commissionValue !== undefined && dto.commissionValue !== null) {
      if (dto.commissionType === 'FIXED_PER_STUDENT') {
        fixedCenterFee = dto.commissionValue;
      } else {
        // إذا أدخل المستخدم مثلاً 75% للمدرس، فإن نسبة السنتر هي (100 - 75 = 25%)
        // وإذا أدخل نسبة السنتر مباشرة (أقل من أو تساوي 50)، نعتبرها نسبة السنتر
        centerPercentage = dto.commissionValue > 50 ? (100 - dto.commissionValue) : dto.commissionValue;
      }
    }

    let userId: string | undefined = undefined;
    if (dto.password && dto.password.trim() !== '') {
      const passwordHash = await bcrypt.hash(dto.password.trim(), 10);
      const existingUser = await this.prisma.user.findFirst({
        where: { phone: dto.phone, tenantId },
      });
      if (existingUser) {
        const updated = await this.prisma.user.update({
          where: { id: existingUser.id },
          data: {
            passwordHash,
            role: 'TEACHER',
            name: dto.name,
          },
        });
        userId = updated.id;
      } else {
        const newUser = await this.prisma.user.create({
          data: {
            tenantId,
            name: dto.name,
            phone: dto.phone,
            passwordHash,
            role: 'TEACHER',
          },
        });
        userId = newUser.id;
      }
    }

    return this.prisma.teacher.create({
      data: {
        tenantId,
        userId,
        name: dto.name,
        phone: dto.phone,
        subjectId,
        commissionType: dto.commissionType || 'PERCENTAGE',
        centerPercentage,
        fixedCenterFee,
        bio: dto.bio,
        avatarUrl: dto.avatarUrl,
      },
      include: {
        subject: true,
        user: {
          select: {
            id: true,
            phone: true,
            role: true,
            isActive: true,
          },
        },
      },
    });
  }

  async getTeachers(tenantId: string) {
    const teachers = await this.prisma.teacher.findMany({
      where: { tenantId, isActive: true },
      include: {
        subject: true,
        user: {
          select: {
            id: true,
            phone: true,
            role: true,
            isActive: true,
          },
        },
        groups: {
          select: {
            id: true,
            name: true,
            academicYear: {
              select: { id: true, name: true },
            },
            _count: { select: { students: true, attendances: true } },
          },
        },
        payouts: {
          select: {
            id: true,
            netPaid: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return teachers.map((t) => ({
      ...t,
      centerPercentage: Number(t.centerPercentage !== null && t.centerPercentage !== undefined ? t.centerPercentage : 20),
      fixedCenterFee: Number(t.fixedCenterFee || 0),
    }));
  }

  async getTeacherById(tenantId: string, id: string) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id, tenantId },
      include: {
        subject: true,
        user: {
          select: {
            id: true,
            phone: true,
            role: true,
            isActive: true,
          },
        },
        groups: {
          where: { isActive: true },
          include: {
            academicYear: true,
            classroom: true,
            students: {
              include: {
                student: {
                  select: {
                    id: true,
                    name: true,
                    studentCode: true,
                    phone: true,
                    guardianPhone: true,
                  },
                },
              },
            },
            _count: { select: { attendances: true, sessions: true } },
          },
        },
        books: true,
        courses: {
          include: {
            academicYear: true,
            chapters: {
              select: {
                id: true,
                lessons: { select: { id: true, title: true } },
              },
            },
            enrollments: { select: { id: true } },
            exams: { select: { id: true } },
          },
        },
        payouts: { orderBy: { paidAt: 'desc' }, take: 20 },
      },
    });
    if (!teacher) throw new NotFoundException('المدرس غير موجود');
    return {
      ...teacher,
      centerPercentage: Number(teacher.centerPercentage !== null && teacher.centerPercentage !== undefined ? teacher.centerPercentage : 20),
      fixedCenterFee: Number(teacher.fixedCenterFee || 0),
    };
  }

  // حساب وتصفية أرباح المدرس (Teacher Payout Engine)
  async calculateAndCreatePayout(tenantId: string, dto: CreateTeacherPayoutDto) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id: dto.teacherId, tenantId },
      include: { groups: true },
    });
    if (!teacher) throw new NotFoundException('المدرس غير موجود');

    const start = new Date(dto.periodStart);
    const end = new Date(dto.periodEnd);

    // جلب الحركات المالية المكتملة لمجموعات هذا المدرس أو المدرس خلال الفترة
    const groupIds = teacher.groups.map((g) => g.id);
    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        OR: [
          { teacherId: teacher.id },
          { groupId: { in: groupIds } },
        ],
        createdAt: { gte: start, lte: end },
      },
    });

    const attendances = await this.prisma.attendance.findMany({
      where: {
        tenantId,
        groupId: { in: groupIds },
        scannedAt: { gte: start, lte: end },
        status: { in: ['PRESENT', 'LATE', 'MAKEUP'] },
      },
      include: { group: true },
    });

    let totalRevenue = 0;
    let centerShare = 0;
    let teacherShare = 0;

    if (transactions.length > 0) {
      for (const tx of transactions) {
        const amount = Number(tx.amount || 0);
        totalRevenue += amount;

        if (teacher.commissionType === 'PERCENTAGE') {
          const centerFee = (amount * Number(teacher.centerPercentage)) / 100;
          centerShare += centerFee;
          teacherShare += amount - centerFee;
        } else {
          const fixedFee = Number(teacher.fixedCenterFee);
          centerShare += fixedFee;
          teacherShare += Math.max(0, amount - fixedFee);
        }
      }
    } else {
      for (const att of attendances) {
        const sessionPrice = Number(att.group.pricePerSession);
        totalRevenue += sessionPrice;

        if (teacher.commissionType === 'PERCENTAGE') {
          const centerFee = (sessionPrice * Number(teacher.centerPercentage)) / 100;
          centerShare += centerFee;
          teacherShare += sessionPrice - centerFee;
        } else {
          const fixedFee = Number(teacher.fixedCenterFee);
          centerShare += fixedFee;
          teacherShare += Math.max(0, sessionPrice - fixedFee);
        }
      }
    }

    const deductions = dto.deductions ? Number(dto.deductions) : 0;
    const netPaid = Math.max(0, teacherShare - deductions);

    const payout = await this.prisma.teacherPayout.create({
      data: {
        tenantId,
        teacherId: teacher.id,
        periodStart: start,
        periodEnd: end,
        totalRevenue,
        centerShare,
        teacherShare,
        deductions,
        netPaid,
        notes: dto.notes,
        paidAt: new Date(),
      },
    });

    return {
      payout,
      attendancesCount: attendances.length,
      groupsCount: groupIds.length,
    };
  }

  async updateTeacher(tenantId: string, id: string, dto: any) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id, tenantId },
      include: { user: true },
    });
    if (!teacher) throw new NotFoundException('المدرس غير موجود');

    let userId = teacher.userId;

    if (dto.password && dto.password.trim() !== '') {
      const passwordHash = await bcrypt.hash(dto.password.trim(), 10);
      if (teacher.userId) {
        await this.prisma.user.update({
          where: { id: teacher.userId },
          data: {
            passwordHash,
            ...(dto.phone ? { phone: dto.phone } : {}),
            ...(dto.name ? { name: dto.name } : {}),
          },
        });
      } else {
        const phone = dto.phone || teacher.phone;
        const existingUser = await this.prisma.user.findFirst({
          where: { phone, tenantId },
        });
        if (existingUser) {
          const updated = await this.prisma.user.update({
            where: { id: existingUser.id },
            data: {
              passwordHash,
              role: 'TEACHER',
              name: dto.name || teacher.name,
            },
          });
          userId = updated.id;
        } else {
          const newUser = await this.prisma.user.create({
            data: {
              tenantId,
              name: dto.name || teacher.name,
              phone,
              passwordHash,
              role: 'TEACHER',
            },
          });
          userId = newUser.id;
        }
      }
    } else if (dto.phone && teacher.userId) {
      await this.prisma.user.update({
        where: { id: teacher.userId },
        data: {
          phone: dto.phone,
          ...(dto.name ? { name: dto.name } : {}),
        },
      });
    }

    let centerPercentage = dto.centerPercentage !== undefined ? dto.centerPercentage : undefined;
    let fixedCenterFee = dto.fixedCenterFee !== undefined ? dto.fixedCenterFee : undefined;

    if (dto.commissionValue !== undefined && dto.commissionValue !== null) {
      if (dto.commissionType === 'FIXED_PER_STUDENT') {
        fixedCenterFee = dto.commissionValue;
      } else {
        centerPercentage = dto.commissionValue > 50 ? (100 - dto.commissionValue) : dto.commissionValue;
      }
    }

    return this.prisma.teacher.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.phone ? { phone: dto.phone } : {}),
        ...(dto.subjectId ? { subjectId: dto.subjectId } : {}),
        ...(dto.commissionType ? { commissionType: dto.commissionType } : {}),
        ...(centerPercentage !== undefined ? { centerPercentage } : {}),
        ...(fixedCenterFee !== undefined ? { fixedCenterFee } : {}),
        ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
        ...(userId ? { userId } : {}),
      },
      include: {
        subject: true,
        user: {
          select: {
            id: true,
            phone: true,
            role: true,
            isActive: true,
          },
        },
      },
    });
  }

  async resetTeacherPassword(tenantId: string, id: string, newPassword: string) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id, tenantId },
      include: { user: true },
    });
    if (!teacher) throw new NotFoundException('المدرس غير موجود');

    if (!newPassword || newPassword.trim().length < 4) {
      throw new BadRequestException('كلمة المرور يجب أن لا تقل عن 4 خانات');
    }

    const passwordHash = await bcrypt.hash(newPassword.trim(), 10);
    if (teacher.userId) {
      await this.prisma.user.update({
        where: { id: teacher.userId },
        data: { passwordHash },
      });
      return { success: true, message: 'تم تحديث كلمة مرور حساب المعلم بنجاح' };
    } else {
      const existingUser = await this.prisma.user.findFirst({
        where: { phone: teacher.phone, tenantId },
      });
      if (existingUser) {
        await this.prisma.user.update({
          where: { id: existingUser.id },
          data: { passwordHash, role: 'TEACHER' },
        });
        await this.prisma.teacher.update({
          where: { id: teacher.id },
          data: { userId: existingUser.id },
        });
      } else {
        const newUser = await this.prisma.user.create({
          data: {
            tenantId,
            name: teacher.name,
            phone: teacher.phone,
            passwordHash,
            role: 'TEACHER',
          },
        });
        await this.prisma.teacher.update({
          where: { id: teacher.id },
          data: { userId: newUser.id },
        });
      }
      return { success: true, message: 'تم إنشاء حساب دخول وتعيين كلمة المرور للمعلم بنجاح' };
    }
  }

  async deleteTeacher(tenantId: string, id: string) {
    const teacher = await this.prisma.teacher.findFirst({ where: { id, tenantId } });
    if (!teacher) throw new NotFoundException('المدرس غير موجود');
    return this.prisma.teacher.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async getTeacherDashboardStats(tenantId: string, teacherIdOrUserId: string) {
    let teacher = await this.prisma.teacher.findFirst({
      where: {
        tenantId,
        OR: [
          { id: teacherIdOrUserId },
          { userId: teacherIdOrUserId },
        ],
      },
      include: {
        subject: true,
        groups: {
          where: { isActive: true },
          include: {
            academicYear: true,
            subject: true,
            classroom: true,
            students: { select: { id: true } },
          },
        },
        courses: {
          include: {
            academicYear: true,
            subject: true,
            chapters: {
              include: { lessons: { select: { id: true, title: true } } },
            },
            enrollments: { select: { id: true } },
            exams: { select: { id: true } },
          },
        },
      },
    });

    if (!teacher) {
      teacher = await this.prisma.teacher.findFirst({
        where: { tenantId, isActive: true },
        include: {
          subject: true,
          groups: {
            where: { isActive: true },
            include: {
              academicYear: true,
              subject: true,
              classroom: true,
              students: { select: { id: true } },
            },
          },
          courses: {
            include: {
              academicYear: true,
              subject: true,
              chapters: {
                include: { lessons: { select: { id: true, title: true } } },
              },
              enrollments: { select: { id: true } },
              exams: { select: { id: true } },
            },
          },
        },
      });
    }

    if (!teacher) {
      throw new NotFoundException('لا يوجد معلم مسجل لهذا الحساب أو السنتر');
    }

    const groupIds = teacher.groups.map((g) => g.id);
    const totalStudentsCount = teacher.groups.reduce((acc, g) => acc + g.students.length, 0);

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const [todaySessions, monthAttendances, monthPayouts, recentAssessments, groupTransactions] = await Promise.all([
      this.prisma.groupSession.findMany({
        where: {
          groupId: { in: groupIds },
          isCancelled: false,
          scheduledDate: { gte: startOfDay, lte: endOfDay },
        },
        include: {
          group: {
            include: { classroom: true, subject: true },
          },
        },
        orderBy: { startTime: 'asc' },
      }),
      this.prisma.attendance.count({
        where: {
          groupId: { in: groupIds },
          scannedAt: {
            gte: new Date(now.getFullYear(), now.getMonth(), 1),
            lte: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
          },
        },
      }),
      this.prisma.teacherPayout.findMany({
        where: { teacherId: teacher.id },
        orderBy: { paidAt: 'desc' },
        take: 10,
      }),
      this.prisma.sessionAssessment.findMany({
        where: {
          attendance: { groupId: { in: groupIds } },
        },
        include: {
          student: { select: { name: true, studentCode: true } },
          attendance: { select: { scannedAt: true, sessionNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.transaction.findMany({
        where: {
          tenantId,
          OR: [
            { teacherId: teacher.id },
            { groupId: { in: groupIds } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    let homeworkDoneCount = 0;
    let homeworkIncompleteCount = 0;
    let homeworkNotDoneCount = 0;
    let quizScoresSum = 0;
    let quizScoresCount = 0;

    recentAssessments.forEach((ass) => {
      if (ass.homeworkStatus === 'DONE') homeworkDoneCount++;
      else if (ass.homeworkStatus === 'INCOMPLETE') homeworkIncompleteCount++;
      else homeworkNotDoneCount++;

      if (ass.quizScore !== null) {
        quizScoresSum += Number(ass.quizScore);
        quizScoresCount++;
      }
    });

    const avgQuizScore = quizScoresCount > 0 ? Math.round((quizScoresSum / quizScoresCount) * 10) / 10 : 0;
    
    // حساب الإيرادات الفعلية ومستحقات المدرس من العمليات المالية
    let totalRevenueCollected = 0;
    let teacherCalculatedEarnings = 0;
    for (const tx of groupTransactions) {
      const amount = Number(tx.amount || 0);
      totalRevenueCollected += amount;
      if (teacher.commissionType === 'PERCENTAGE') {
        const centerShare = (amount * Number(teacher.centerPercentage)) / 100;
        teacherCalculatedEarnings += (amount - centerShare);
      } else {
        const fixedFee = Number(teacher.fixedCenterFee);
        teacherCalculatedEarnings += Math.max(0, amount - fixedFee);
      }
    }

    const totalPaidOut = monthPayouts.reduce((sum, p) => sum + Number(p.netPaid || 0), 0);
    const unsettledEarnings = Math.max(0, teacherCalculatedEarnings - totalPaidOut);

    return {
      teacher: {
        id: teacher.id,
        name: teacher.name,
        phone: teacher.phone,
        subjectName: teacher.subject?.name ?? 'عام',
        bio: teacher.bio,
        avatarUrl: teacher.avatarUrl,
        commissionType: teacher.commissionType,
        centerPercentage: Number(teacher.centerPercentage),
        fixedCenterFee: Number(teacher.fixedCenterFee),
      },
      stats: {
        totalStudents: totalStudentsCount,
        totalStudentsCount,
        totalGroupsCount: teacher.groups.length,
        totalCoursesCount: teacher.courses.length,
        monthAttendancesCount: monthAttendances,
        totalEarnings: teacherCalculatedEarnings > 0 ? teacherCalculatedEarnings : totalPaidOut,
        totalRevenueCollected,
        totalPaidOut,
        unsettledEarnings,
        walletBalance: unsettledEarnings,
        avgQuizScore,
        homeworkStats: {
          done: homeworkDoneCount,
          incomplete: homeworkIncompleteCount,
          notDone: homeworkNotDoneCount,
        },
      },
      todaySessions: todaySessions.map((s) => ({
        id: s.id,
        groupId: s.groupId,
        groupName: s.group.name,
        sessionNumber: s.sessionNumber,
        title: s.title,
        startTime: s.startTime,
        endTime: s.endTime,
        classroomName: s.group.classroom?.name ?? 'القاعة الرئيسية',
        isCompleted: s.isCompleted,
      })),
      groups: teacher.groups.map((g) => ({
        id: g.id,
        name: g.name,
        academicYearName: g.academicYear?.name ?? '',
        studentsCount: g.students.length,
        _count: { students: g.students.length },
        pricePerSession: Number(g.pricePerSession),
        monthlyFee: Number(g.monthlyFee),
        startTime: g.startTime,
        endTime: g.endTime,
      })),
      courses: teacher.courses.map((c) => ({
        id: c.id,
        title: c.title,
        price: Number(c.price),
        thumbnailUrl: c.thumbnailUrl,
        isPublished: c.isPublished,
        enrolledCount: c.enrollments.length,
        totalLessons: c.chapters.reduce((sum, ch) => sum + ch.lessons.length, 0),
        totalQuizzes: c.exams.length,
      })),
      recentAssessments: recentAssessments.map((a) => ({
        id: a.id,
        studentName: a.student.name,
        studentCode: a.student.studentCode,
        homeworkStatus: a.homeworkStatus,
        quizScore: a.quizScore !== null ? Number(a.quizScore) : null,
        quizTotal: a.quizTotal !== null ? Number(a.quizTotal) : 10,
        behaviorNotes: a.behaviorNotes,
        sessionNumber: a.attendance?.sessionNumber,
        date: a.createdAt,
      })),
    };
  }
}


