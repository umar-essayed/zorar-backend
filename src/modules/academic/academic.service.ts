import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateAcademicYearDto, CreateSubjectDto, CreateClassroomDto, CreateGroupDto } from './dto/create-group.dto';

@Injectable()
export class AcademicService {
  constructor(private prisma: PrismaService) {}

  // السنوات الدراسية
  async createYear(tenantId: string, dto: CreateAcademicYearDto) {
    return this.prisma.academicYear.create({
      data: {
        name: dto.name,
        tenantId,
      },
    });
  }

  async getYears(tenantId: string) {
    return this.prisma.academicYear.findMany({
      where: { tenantId },
      include: { groups: true },
      orderBy: { orderIndex: 'asc' },
    });
  }

  // المواد
  async createSubject(tenantId: string, dto: CreateSubjectDto) {
    return this.prisma.subject.create({
      data: {
        name: dto.name,
        code: dto.code,
        tenantId,
      },
    });
  }

  async getSubjects(tenantId: string) {
    return this.prisma.subject.findMany({
      where: { tenantId },
    });
  }

  // القاعات
  async createClassroom(tenantId: string, dto: CreateClassroomDto) {
    return this.prisma.classroom.create({
      data: {
        name: dto.name,
        capacity: dto.capacity || 50,
        tenantId,
      },
    });
  }

  async getClassrooms(tenantId: string) {
    return this.prisma.classroom.findMany({
      where: { tenantId },
    });
  }

  // المجموعات
  async createGroup(tenantId: string, dto: CreateGroupDto) {
    // فحص تعارض مواعيد القاعة (Conflict Checking)
    if (dto.classroomId) {
      const conflictingGroup = await this.prisma.group.findFirst({
        where: {
          tenantId,
          classroomId: dto.classroomId,
          isActive: true,
          dayOfWeek: { hasSome: dto.dayOfWeek },
          OR: [
            {
              startTime: { lte: dto.startTime },
              endTime: { gt: dto.startTime },
            },
            {
              startTime: { lt: dto.endTime },
              endTime: { gte: dto.endTime },
            },
          ],
        },
      });

      if (conflictingGroup) {
        throw new ConflictException(`تعارض في القاعة: يوجد مجموعة أخرى (${conflictingGroup.name}) في نفس التوقيت`);
      }
    }

    const pricePerSession = dto.pricePerSession ?? dto.sessionPrice ?? 0;
    const monthlyFee = dto.monthlyFee ?? dto.monthlyPrice ?? 0;
    const maxStudents = dto.maxStudents ?? dto.capacity ?? 50;
    const sessionsPerMonth = dto.sessionsPerMonth ?? 4;
    const gracePeriodMinutes = dto.gracePeriodMinutes ?? 30;
    const allowedGraceSessions = dto.allowedGraceSessions ?? 1;
    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();

    const createdGroup = await this.prisma.group.create({
      data: {
        tenantId,
        name: dto.name,
        academicYearId: dto.academicYearId,
        subjectId: dto.subjectId,
        teacherId: dto.teacherId || null,
        classroomId: dto.classroomId || null,
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        pricePerSession,
        monthlyFee,
        maxStudents,
        sessionsPerMonth,
        gracePeriodMinutes,
        allowedGraceSessions,
        startDate,
      },
      include: {
        academicYear: true,
        subject: true,
        classroom: true,
        teacher: true,
        _count: { select: { students: true } },
      },
    });

    // توليد الحصص المجدولة تلقائياً للدورة الأولى (مثلاً شهرين = عدد الحصص * 2)
    try {
      await this.generateSessionsForGroup(tenantId, createdGroup.id, sessionsPerMonth * 2, dto.startDate);
    } catch {
      // عدم إيقاف إنشاء المجموعة لو تعذر توليد الحصص فوراً
    }

    return createdGroup;
  }

  // توليد الحصص المجدولة لمجموعة وفق أيام الأسبوع
  async generateSessionsForGroup(
    tenantId: string,
    groupId: string,
    count: number = 8,
    startDateStr?: string,
  ) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, tenantId },
    });
    if (!group) throw new NotFoundException('المجموعة غير موجودة');

    const lastSession = await this.prisma.groupSession.findFirst({
      where: { groupId, tenantId },
      orderBy: { sessionNumber: 'desc' },
    });

    let currentNumber = lastSession ? lastSession.sessionNumber + 1 : 1;
    let cursorDate = startDateStr
      ? new Date(startDateStr)
      : lastSession && lastSession.scheduledDate
      ? new Date(new Date(lastSession.scheduledDate).getTime() + 24 * 60 * 60 * 1000)
      : group.startDate
      ? new Date(group.startDate)
      : new Date();

    cursorDate.setHours(0, 0, 0, 0);

    const days = Array.isArray(group.dayOfWeek) && group.dayOfWeek.length > 0 ? group.dayOfWeek : [6];
    const createdSessions = [];
    let safetyCounter = 0;

    while (createdSessions.length < count && safetyCounter < 120) {
      const dayOfWeek = cursorDate.getDay();
      if (days.includes(dayOfWeek)) {
        const sessionDate = new Date(cursorDate);
        const session = await this.prisma.groupSession.upsert({
          where: {
            groupId_sessionNumber: {
              groupId,
              sessionNumber: currentNumber,
            },
          },
          update: {},
          create: {
            tenantId,
            groupId,
            sessionNumber: currentNumber,
            title: `الحصة ${currentNumber}`,
            scheduledDate: sessionDate,
            startTime: group.startTime,
            endTime: group.endTime,
          },
        });
        createdSessions.push(session);
        currentNumber++;
      }
      cursorDate.setDate(cursorDate.getDate() + 1);
      safetyCounter++;
    }

    return createdSessions;
  }

  // جلب حصص المجموعة وإحصائيات الحضور لكل حصة
  async getGroupSessions(tenantId: string, groupId: string) {
    const group = await this.prisma.group.findFirst({ where: { id: groupId, tenantId } });
    if (!group) throw new NotFoundException('المجموعة غير موجودة');

    let sessions = await this.prisma.groupSession.findMany({
      where: { groupId, tenantId },
      include: {
        attendances: {
          select: {
            id: true,
            status: true,
            lateMinutes: true,
            isGraceSession: true,
            studentId: true,
          },
        },
      },
      orderBy: { sessionNumber: 'asc' },
    });

    if (sessions.length === 0) {
      await this.generateSessionsForGroup(tenantId, groupId, (group.sessionsPerMonth || 4) * 2);
      sessions = await this.prisma.groupSession.findMany({
        where: { groupId, tenantId },
        include: {
          attendances: {
            select: {
              id: true,
              status: true,
              lateMinutes: true,
              isGraceSession: true,
              studentId: true,
            },
          },
        },
        orderBy: { sessionNumber: 'asc' },
      });
    }

    return sessions.map((s) => ({
      ...s,
      stats: {
        totalPresent: s.attendances.filter((a) => a.status === 'PRESENT' || a.status === 'LATE').length,
        totalLate: s.attendances.filter((a) => a.status === 'LATE').length,
        totalAbsent: s.attendances.filter((a) => a.status === 'ABSENT').length,
        totalGrace: s.attendances.filter((a) => a.isGraceSession).length,
      },
    }));
  }

  // تعديل موعد حصة استثنائية (استثناء / تأجيل / إلغاء)
  async rescheduleGroupSession(
    tenantId: string,
    groupId: string,
    sessionId: string,
    dto: {
      actualDate?: string;
      startTime?: string;
      endTime?: string;
      title?: string;
      isCancelled?: boolean;
      notes?: string;
    },
  ) {
    const session = await this.prisma.groupSession.findFirst({
      where: { id: sessionId, groupId, tenantId },
    });
    if (!session) throw new NotFoundException('الحصة غير موجودة');

    return this.prisma.groupSession.update({
      where: { id: sessionId },
      data: {
        actualDate: dto.actualDate ? new Date(dto.actualDate) : undefined,
        startTime: dto.startTime ?? undefined,
        endTime: dto.endTime ?? undefined,
        title: dto.title ?? undefined,
        isCancelled: dto.isCancelled !== undefined ? dto.isCancelled : undefined,
        notes: dto.notes ?? undefined,
      },
    });
  }

  // جلب التحليلات الكاملة للمجموعة والطلاب والحصص والوضع المالي
  async getGroupAnalytics(tenantId: string, groupId: string) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, tenantId },
      include: {
        academicYear: true,
        subject: true,
        classroom: true,
        teacher: true,
        students: {
          include: {
            student: {
              include: {
                monthlySubs: {
                  where: { groupId },
                  orderBy: { monthNumber: 'desc' },
                },
                attendances: {
                  where: { groupId },
                  orderBy: { scannedAt: 'desc' },
                },
              },
            },
          },
        },
        sessions: {
          orderBy: { sessionNumber: 'asc' },
          include: {
            attendances: {
              include: {
                student: { select: { id: true, name: true, studentCode: true, guardianPhone: true, phone: true } },
                assessment: true,
              },
            },
          },
        },
      },
    });

    if (!group) throw new NotFoundException('المجموعة غير موجودة');

    const currentMonthNumber = new Date().getMonth() + 1;

    // تفاصيل الطلاب والوضع المالي وحصص السماح
    const studentList = group.students.map((sg) => {
      const st = sg.student;
      const sub = st.monthlySubs.find((m) => m.monthNumber === currentMonthNumber);
      const isPaid = !!sub?.isPaid;

      const totalGroupAttendances = st.attendances.length;
      const graceAttendances = st.attendances.filter((a) => a.isGraceSession).length;

      const sessionsPerMonth = group.sessionsPerMonth || 4;
      const cycleSessionIndex = (totalGroupAttendances % sessionsPerMonth) || (totalGroupAttendances > 0 ? sessionsPerMonth : 0);

      let financialStatus: 'PAID' | 'DUE_LAST_SESSION' | 'GRACE_ACTIVE' | 'OVERDUE' | 'UNPAID' = 'UNPAID';

      if (isPaid) {
        if (cycleSessionIndex === sessionsPerMonth) {
          financialStatus = 'DUE_LAST_SESSION';
        } else {
          financialStatus = 'PAID';
        }
      } else {
        if (graceAttendances > 0) {
          financialStatus = graceAttendances >= group.allowedGraceSessions ? 'OVERDUE' : 'GRACE_ACTIVE';
        } else {
          financialStatus = 'UNPAID';
        }
      }

      return {
        id: st.id,
        name: st.name,
        studentCode: st.studentCode,
        phone: st.phone,
        guardianPhone: st.guardianPhone,
        joinedAt: sg.joinedAt,
        totalAttendances: totalGroupAttendances,
        graceAttendances,
        cycleSessionIndex,
        isPaid,
        paidAt: sub?.paidAt || null,
        amount: sub?.amount ? Number(sub.amount) : Number(group.monthlyFee),
        financialStatus,
      };
    });

    const totalEnrolled = studentList.length;
    const totalPaid = studentList.filter((s) => s.isPaid).length;
    const totalDueLastSession = studentList.filter((s) => s.financialStatus === 'DUE_LAST_SESSION').length;
    const totalGrace = studentList.filter((s) => s.financialStatus === 'GRACE_ACTIVE').length;
    const totalOverdue = studentList.filter((s) => s.financialStatus === 'OVERDUE' || (s.financialStatus === 'UNPAID' && !s.isPaid)).length;
    const totalCollected = studentList
      .filter((s) => s.isPaid)
      .reduce((sum, s) => sum + s.amount, 0);

    return {
      group: {
        id: group.id,
        name: group.name,
        teacher: group.teacher?.name,
        subject: group.subject?.name,
        academicYear: group.academicYear?.name,
        classroom: group.classroom?.name,
        dayOfWeek: group.dayOfWeek,
        startTime: group.startTime,
        endTime: group.endTime,
        pricePerSession: Number(group.pricePerSession),
        monthlyFee: Number(group.monthlyFee),
        sessionsPerMonth: group.sessionsPerMonth,
        allowedGraceSessions: group.allowedGraceSessions,
        gracePeriodMinutes: group.gracePeriodMinutes,
        maxStudents: group.maxStudents,
        startDate: group.startDate,
      },
      kpis: {
        totalEnrolled,
        occupancyRate: group.maxStudents ? Math.round((totalEnrolled / group.maxStudents) * 100) : 0,
        totalPaid,
        totalDueLastSession,
        totalGrace,
        totalOverdue,
        totalCollected,
        projectedRevenue: totalEnrolled * Number(group.monthlyFee),
      },
      students: studentList,
      sessions: group.sessions,
    };
  }

  async getGroups(tenantId: string) {
    return this.prisma.group.findMany({
      where: { tenantId, isActive: true },
      include: {
        academicYear: true,
        subject: true,
        classroom: true,
        teacher: true,
        _count: { select: { students: true } },
      },
    });
  }

  async getGroupById(tenantId: string, groupId: string) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, tenantId },
      include: {
        academicYear: true,
        subject: true,
        classroom: true,
        students: {
          include: {
            student: {
              include: { card: true },
            },
          },
        },
      },
    });

    if (!group) throw new NotFoundException('المجموعة غير موجودة');
    return group;
  }

  async updateGroup(tenantId: string, id: string, dto: any) {
    const group = await this.prisma.group.findFirst({ where: { id, tenantId } });
    if (!group) throw new NotFoundException('المجموعة غير موجودة');

    const pricePerSession =
      dto.pricePerSession !== undefined
        ? dto.pricePerSession
        : dto.sessionPrice !== undefined
        ? dto.sessionPrice
        : undefined;
    const monthlyFee =
      dto.monthlyFee !== undefined
        ? dto.monthlyFee
        : dto.monthlyPrice !== undefined
        ? dto.monthlyPrice
        : undefined;
    const maxStudents =
      dto.maxStudents !== undefined
        ? dto.maxStudents
        : dto.capacity !== undefined
        ? dto.capacity
        : undefined;
    const sessionsPerMonth =
      dto.sessionsPerMonth !== undefined
        ? Number(dto.sessionsPerMonth)
        : undefined;
    const gracePeriodMinutes =
      dto.gracePeriodMinutes !== undefined
        ? Number(dto.gracePeriodMinutes)
        : undefined;
    const allowedGraceSessions =
      dto.allowedGraceSessions !== undefined
        ? Number(dto.allowedGraceSessions)
        : undefined;
    const startDate = dto.startDate ? new Date(dto.startDate) : undefined;

    return this.prisma.group.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.academicYearId ? { academicYearId: dto.academicYearId } : {}),
        ...(dto.subjectId ? { subjectId: dto.subjectId } : {}),
        ...(dto.teacherId !== undefined ? { teacherId: dto.teacherId || null } : {}),
        ...(dto.classroomId !== undefined ? { classroomId: dto.classroomId || null } : {}),
        ...(dto.dayOfWeek ? { dayOfWeek: dto.dayOfWeek } : {}),
        ...(dto.startTime ? { startTime: dto.startTime } : {}),
        ...(dto.endTime ? { endTime: dto.endTime } : {}),
        ...(pricePerSession !== undefined ? { pricePerSession } : {}),
        ...(monthlyFee !== undefined ? { monthlyFee } : {}),
        ...(maxStudents !== undefined ? { maxStudents } : {}),
        ...(sessionsPerMonth !== undefined ? { sessionsPerMonth } : {}),
        ...(gracePeriodMinutes !== undefined ? { gracePeriodMinutes } : {}),
        ...(allowedGraceSessions !== undefined ? { allowedGraceSessions } : {}),
        ...(startDate ? { startDate } : {}),
      },
      include: {
        classroom: true,
        academicYear: true,
        subject: true,
        teacher: true,
        _count: { select: { students: true } },
      },
    });
  }

  async deleteGroup(tenantId: string, id: string) {
    const group = await this.prisma.group.findFirst({ where: { id, tenantId } });
    if (!group) throw new NotFoundException('المجموعة غير موجودة');
    return this.prisma.group.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async updateYear(tenantId: string, id: string, dto: { name?: string; orderIndex?: number }) {
    const yr = await this.prisma.academicYear.findFirst({ where: { id, tenantId } });
    if (!yr) throw new NotFoundException('السنة الدراسية غير موجودة');
    return this.prisma.academicYear.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.orderIndex !== undefined ? { orderIndex: dto.orderIndex } : {}),
      },
    });
  }

  async deleteYear(tenantId: string, id: string) {
    const yr = await this.prisma.academicYear.findFirst({ where: { id, tenantId } });
    if (!yr) throw new NotFoundException('السنة الدراسية غير موجودة');
    return this.prisma.academicYear.delete({ where: { id } });
  }

  async updateSubject(tenantId: string, id: string, dto: { name?: string; code?: string }) {
    const sub = await this.prisma.subject.findFirst({ where: { id, tenantId } });
    if (!sub) throw new NotFoundException('المادة الدراسية غير موجودة');
    return this.prisma.subject.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.code !== undefined ? { code: dto.code } : {}),
      },
    });
  }

  async deleteSubject(tenantId: string, id: string) {
    const sub = await this.prisma.subject.findFirst({ where: { id, tenantId } });
    if (!sub) throw new NotFoundException('المادة الدراسية غير موجودة');
    return this.prisma.subject.delete({ where: { id } });
  }

  // مزامنة وتوليد المراحل والصفوف الدراسية تلقائياً بما فيها البكالوريا
  async syncStages(tenantId: string, stages: string[]) {
    const stageDefinitions: Record<string, { name: string; orderIndex: number }[]> = {
      PRIMARY: [
        { name: 'الصف الأول الابتدائي', orderIndex: 10 },
        { name: 'الصف الثاني الابتدائي', orderIndex: 20 },
        { name: 'الصف الثالث الابتدائي', orderIndex: 30 },
        { name: 'الصف الرابع الابتدائي', orderIndex: 40 },
        { name: 'الصف الخامس الابتدائي', orderIndex: 50 },
        { name: 'الصف السادس الابتدائي', orderIndex: 60 },
      ],
      PREPARATORY: [
        { name: 'الصف الأول الإعدادي', orderIndex: 100 },
        { name: 'الصف الثاني الإعدادي', orderIndex: 110 },
        { name: 'الصف الثالث الإعدادي', orderIndex: 120 },
      ],
      SECONDARY: [
        { name: 'الصف الأول الثانوي', orderIndex: 200 },
        { name: 'الصف الثاني الثانوي', orderIndex: 210 },
        { name: 'الصف الثالث الثانوي', orderIndex: 220 },
      ],
      BACCALAUREATE: [
        { name: 'أولى بكالوريا', orderIndex: 300 },
        { name: 'ثانية بكالوريا', orderIndex: 310 },
        { name: 'ثالثة بكالوريا', orderIndex: 320 },
      ],
    };

    const existingYears = await this.prisma.academicYear.findMany({
      where: { tenantId },
    });
    const existingNames = new Set(existingYears.map((y) => y.name.trim()));

    const yearsToCreate: { name: string; orderIndex: number }[] = [];
    for (const stage of stages) {
      const defs = stageDefinitions[stage.toUpperCase()];
      if (defs) {
        for (const yearDef of defs) {
          if (!existingNames.has(yearDef.name)) {
            yearsToCreate.push(yearDef);
            existingNames.add(yearDef.name);
          }
        }
      }
    }

    for (const y of yearsToCreate) {
      await this.prisma.academicYear.create({
        data: {
          tenantId,
          name: y.name,
          orderIndex: y.orderIndex,
        },
      });
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const currentSettings = (tenant?.settings as Record<string, any>) || {};
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...currentSettings,
          selectedStages: stages,
        },
      },
    });

    return this.getYears(tenantId);
  }

  async openEmergencySession(
    tenantId: string,
    groupId: string,
    dto: {
      sessionNumber?: number;
      title?: string;
      reason?: string;
      date?: string;
    },
  ) {
    const group = await this.prisma.group.findFirst({ where: { id: groupId, tenantId } });
    if (!group) throw new NotFoundException('المجموعة غير موجودة');

    const sessionNum = dto.sessionNumber || 1;
    const now = dto.date ? new Date(dto.date) : new Date();

    const existing = await this.prisma.groupSession.findFirst({
      where: { groupId, sessionNumber: sessionNum },
    });

    if (existing) {
      return this.prisma.groupSession.update({
        where: { id: existing.id },
        data: {
          actualDate: now,
          title: dto.title || `جلسة استثنائية (حصة ${sessionNum})`,
          notes: dto.reason || 'جلسة حضور استثنائية',
          isCancelled: false,
        },
      });
    }

    return this.prisma.groupSession.create({
      data: {
        tenantId,
        groupId,
        sessionNumber: sessionNum,
        title: dto.title || `جلسة استثنائية (حصة ${sessionNum})`,
        scheduledDate: now,
        actualDate: now,
        notes: dto.reason || 'جلسة حضور استثنائية',
        isCancelled: false,
        isCompleted: false,
      },
    });
  }
}

