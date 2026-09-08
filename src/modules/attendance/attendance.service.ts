import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ScanAttendanceDto, BatchOfflineSyncDto, RecordSessionAssessmentDto } from './dto/scan-qr.dto';
import { AttendanceStatus, WarningLevel } from '@prisma/client';

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  private extractStudentCode(identifier: string): string {
    if (identifier.startsWith('ZORAR:')) {
      const parts = identifier.split(':');
      if (parts.length >= 3) {
        return parts[2];
      }
    }
    return identifier.trim();
  }

  private groupCache = new Map<string, { group: any; cachedAt: number }>();
  private userCache = new Map<string, { valid: boolean; cachedAt: number }>();

  private async getCachedGroup(tenantId: string, groupId: string) {
    const cached = this.groupCache.get(groupId);
    if (cached && Date.now() - cached.cachedAt < 180_000) {
      return cached.group;
    }
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, tenantId },
    });
    if (group) {
      this.groupCache.set(groupId, { group, cachedAt: Date.now() });
    }
    return group;
  }

  private async resolveValidUserId(userId?: string): Promise<string | null> {
    if (!userId) return null;
    const cached = this.userCache.get(userId);
    if (cached && Date.now() - cached.cachedAt < 180_000) {
      return cached.valid ? userId : null;
    }
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      const valid = !!user?.id;
      this.userCache.set(userId, { valid, cachedAt: Date.now() });
      return valid ? userId : null;
    } catch {
      return null;
    }
  }

  async scanAttendance(tenantId: string, assistantId: string, dto: ScanAttendanceDto) {
    const studentCode = this.extractStudentCode(dto.identifier);

    // 1. جلب الطالب بالحد الأدنى من الحقول
    const student = await this.prisma.student.findUnique({
      where: { tenantId_studentCode: { tenantId, studentCode } },
      select: {
        id: true,
        name: true,
        studentCode: true,
        guardianPhone: true,
        groups: { where: { groupId: dto.groupId }, select: { id: true } },
      },
    });

    if (!student) {
      throw new NotFoundException(`الطالب بكود (${studentCode}) غير مسجل في المنظومة`);
    }

    // 2. جلب المجموعة والمساعد من الكاش اللحظي (0ms)
    const group = await this.getCachedGroup(tenantId, dto.groupId);
    if (!group) {
      throw new NotFoundException('المجموعة غير موجودة');
    }

    const validScannedById = await this.resolveValidUserId(assistantId);

    // 3. التحقق السريع من الحضور المسبق اليوم
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const existingAttendance = await this.prisma.attendance.findFirst({
      where: {
        tenantId,
        studentId: student.id,
        groupId: dto.groupId,
        scannedAt: { gte: startOfToday },
      },
      select: { id: true },
    });

    if (existingAttendance) {
      throw new BadRequestException(`تم تسجيل حضور الطالب (${student.name}) مسبقاً اليوم`);
    }

    const isMakeup = dto.isMakeup || student.groups.length === 0;

    // احتساب المهلة الذكية والتأخير (Grace Period & Late Threshold)
    const now = new Date();
    let calculatedStatus: AttendanceStatus = AttendanceStatus.PRESENT;
    let lateMinutes = 0;
    let isAfterSession = false;

    if (group.startTime) {
      const [sHour, sMin] = group.startTime.split(':').map((v: string) => parseInt(v, 10));
      if (!isNaN(sHour) && !isNaN(sMin)) {
        const groupStart = new Date(now);
        groupStart.setHours(sHour, sMin, 0, 0);

        const graceMins = (group as any).gracePeriodMinutes ?? 30;
        const graceDeadline = new Date(groupStart.getTime() + graceMins * 60 * 1000);

        if (group.endTime) {
          const [eHour, eMin] = group.endTime.split(':').map((v: string) => parseInt(v, 10));
          if (!isNaN(eHour) && !isNaN(eMin)) {
            const groupEnd = new Date(now);
            groupEnd.setHours(eHour, eMin, 0, 0);
            if (now > groupEnd) {
              isAfterSession = true;
            }
          }
        }

        if (now > graceDeadline) {
          calculatedStatus = AttendanceStatus.LATE;
          lateMinutes = Math.max(1, Math.round((now.getTime() - groupStart.getTime()) / (60 * 1000)));
        }
      }
    }

    const finalStatus = isMakeup
      ? AttendanceStatus.MAKEUP
      : (dto.status || calculatedStatus);

    // تحديد رقم الجلسة / الحصة والنافذة اليومية (Daily Window 24h) ونظام الاستثناءات
    let targetSessionId: string | null = dto.sessionId || null;
    let targetSessionNumber: number | null = dto.sessionNumber || null;
    let sessionExceptionNotice: string | null = null;

    if (targetSessionId) {
      const explicitSession = await this.prisma.groupSession.findFirst({
        where: { id: targetSessionId, groupId: dto.groupId, tenantId },
      });
      if (explicitSession) {
        targetSessionNumber = explicitSession.sessionNumber;

        // هل انعقدت الحصة في يوم مخالف لتاريخ جدولتها المعتاد؟ (استثناء)
        const sched = new Date(explicitSession.scheduledDate);
        const isDifferentDay =
          sched.getFullYear() !== now.getFullYear() ||
          sched.getMonth() !== now.getMonth() ||
          sched.getDate() !== now.getDate();

        if (isDifferentDay) {
          const dateFormatted = now.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
          const exceptionNote = `جلسة استثنائية: تم تسجيل الحضور في موعد مخالف بتاريخ (${dateFormatted})`;
          sessionExceptionNotice = exceptionNote;

          if (!explicitSession.actualDate) {
            const combinedNotes = explicitSession.notes
              ? `${explicitSession.notes} • ${exceptionNote}`
              : exceptionNote;

            await this.prisma.groupSession.update({
              where: { id: explicitSession.id },
              data: {
                actualDate: now,
                notes: combinedNotes,
              },
            }).catch(() => null);
          }
        }
      }
    } else {
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      const todaySession = await this.prisma.groupSession.findFirst({
        where: {
          tenantId,
          groupId: dto.groupId,
          isCancelled: false,
          OR: [
            { actualDate: { gte: startOfDay, lte: endOfDay } },
            { scheduledDate: { gte: startOfDay, lte: endOfDay }, actualDate: null },
          ],
        },
      });

      if (todaySession) {
        targetSessionId = todaySession.id;
        targetSessionNumber = todaySession.sessionNumber;
      }
    }

    // فحص إحصائيات الشهر والوضع المالي وحصص السماح (Grace Sessions)
    const currentMonthNumber = now.getMonth() + 1;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const [monthCount, monthlySub] = await Promise.all([
      this.prisma.attendance.count({
        where: {
          tenantId,
          studentId: student.id,
          groupId: dto.groupId,
          scannedAt: { gte: startOfMonth, lte: endOfMonth },
          status: { not: AttendanceStatus.ABSENT },
        },
      }),
      this.prisma.monthlySubscription.findFirst({
        where: {
          tenantId,
          studentId: student.id,
          groupId: dto.groupId,
          monthNumber: currentMonthNumber,
        },
      }),
    ]);

    const sessionsPerMonth = (group as any).sessionsPerMonth || 4;
    const allowedGrace = (group as any).allowedGraceSessions ?? 1;

    let isGraceSession = false;
    let graceAlert: string | null = null;
    let renewalNotice: string | null = null;

    if (!monthlySub?.isPaid) {
      const graceCount = await this.prisma.attendance.count({
        where: {
          tenantId,
          studentId: student.id,
          groupId: dto.groupId,
          isGraceSession: true,
          scannedAt: { gte: startOfMonth, lte: endOfMonth },
        },
      });

      if (monthCount >= sessionsPerMonth || graceCount > 0) {
        if (graceCount < allowedGrace) {
          isGraceSession = true;
          graceAlert = `⚠️ حصة سماح (${graceCount + 1} من ${allowedGrace}): اشتراك الشهر الجديد غير مسدد. يرجى التكرم بالسداد في أقرب وقت.`;
        } else if (!dto.forceGrace) {
          throw new BadRequestException(
            `⛔ لا يمكن تسجيل الحضور! استنفذ الطالب (${student.name}) الحد الأقصى لحصص السماح (${allowedGrace} حصة) دون سداد اشتراك الشهر الجديد. يرجى سداد الاشتراك لتسجيل الحضور.`,
          );
        } else {
          isGraceSession = true;
          graceAlert = `⚠️ استثناء إداري: تم تسجيل الحضور بحصة سماح إضافية بتصريح يدوي.`;
        }
      }
    } else {
      if (monthCount + 1 === sessionsPerMonth) {
        renewalNotice = `🔔 تنبيه التجديد: هذه هي الحصة الأخيرة (${monthCount + 1} من ${sessionsPerMonth}) في اشتراك الشهر. موعد سداد الشهر القادم يبدأ من الحصة القادمة.`;
      }
    }

    if (!targetSessionNumber) {
      targetSessionNumber = (monthCount % sessionsPerMonth) + 1;
    }

    // 4. تسجيل الحضور فوراً
    const attendance = await this.prisma.attendance.create({
      data: {
        tenantId,
        studentId: student.id,
        groupId: dto.groupId,
        scannedById: validScannedById,
        sessionId: targetSessionId,
        sessionNumber: targetSessionNumber,
        isGraceSession,
        status: finalStatus,
        lateMinutes,
        scannedAt: now,
        isMakeup,
        originalGroupId: dto.originalGroupId,
      },
      select: {
        id: true,
        status: true,
        lateMinutes: true,
        scannedAt: true,
        sessionNumber: true,
        isGraceSession: true,
      },
    });

    // 5. تشغيل تحديث النقاط وإشعار الواتساب في الخلفية فوراً دون تأخير الرد
    this.prisma.student
      .update({
        where: { id: student.id },
        data: {
          consecutiveAbsences: 0,
          points: { increment: 5 },
        },
      })
      .catch(() => null);

    if (student.guardianPhone) {
      const timeStr = attendance.scannedAt.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
      let msgText = '';
      if (isMakeup) {
        msgText = `تم تسجيل حضور الطالب (${student.name}) كحصة تعويضية بمجموعة ${group.name} اليوم الساعة ${timeStr}.`;
      } else if (isGraceSession) {
        msgText = `⚠️ تنبيه من السنتر: تم تسجيل حضور الطالب (${student.name}) لحصة ${group.name} اليوم كـ (حصة سماح) لعدم سداد اشتراك الشهر الجديد. يرجى التكرم بالسداد في أقرب وقت.`;
      } else if (finalStatus === AttendanceStatus.LATE) {
        msgText = `⚠️ تنبيه من السنتر: تم تسجيل حضور الطالب (${student.name}) لحصة ${group.name} اليوم متأخراً (${lateMinutes} دقيقة) في تمام الساعة ${timeStr}.`;
      } else {
        msgText = `تم تسجيل حضور الطالب (${student.name}) لحصة ${group.name} (الحصة رقم ${targetSessionNumber}) اليوم في تمام الساعة ${timeStr}.`;
      }

      this.prisma.whatsAppMessage
        .create({
          data: {
            tenantId,
            recipient: student.guardianPhone,
            templateKey: isGraceSession ? 'ATTENDANCE_GRACE_ALERT' : finalStatus === AttendanceStatus.LATE ? 'ATTENDANCE_LATE_ALERT' : 'ATTENDANCE_CONFIRMATION',
            content: msgText,
          },
        })
        .catch(() => null);
    }

    return {
      attendanceId: attendance.id,
      studentName: student.name,
      studentCode: student.studentCode,
      status: attendance.status,
      lateMinutes,
      isAfterSession,
      isMakeup,
      isGraceSession,
      sessionNumber: targetSessionNumber,
      graceAlert,
      renewalNotice,
      sessionExceptionNotice,
      scannedAt: attendance.scannedAt,
      monthStats: {
        monthNumber: currentMonthNumber,
        attendedSessions: monthCount + 1,
        totalSessions: (group as any).sessionsPerMonth || 4,
        isPaid: !!monthlySub?.isPaid,
        amount: monthlySub?.amount ? Number(monthlySub.amount) : Number(group.monthlyFee || 0),
        sessionPrice: Number(group.pricePerSession || 0),
      },
    };
  }

  // تسجيل تقييم الحصة (واجب + كويز تسميع + سلوك)
  async recordAssessment(tenantId: string, assistantId: string, dto: RecordSessionAssessmentDto) {
    let attendance = null;
    if (dto.attendanceId) {
      attendance = await this.prisma.attendance.findFirst({
        where: { id: dto.attendanceId, tenantId },
        include: { student: true, group: true },
      });
    } else if (dto.studentId) {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      attendance = await this.prisma.attendance.findFirst({
        where: {
          tenantId,
          studentId: dto.studentId,
          ...(dto.groupId ? { groupId: dto.groupId } : {}),
          scannedAt: { gte: startOfDay, lte: endOfDay },
        },
        include: { student: true, group: true },
      });

      if (!attendance) {
        const validAssistantId = await this.resolveValidUserId(assistantId);
        let targetGroupId = dto.groupId;
        if (!targetGroupId) {
          const studentGrp = await this.prisma.studentGroup.findFirst({
            where: { studentId: dto.studentId, group: { tenantId } },
          });
          targetGroupId = studentGrp?.groupId;
        }

        if (targetGroupId) {
          attendance = await this.prisma.attendance.create({
            data: {
              tenantId,
              studentId: dto.studentId,
              groupId: targetGroupId,
              status: AttendanceStatus.PRESENT,
              scannedById: validAssistantId,
              scannedAt: new Date(),
            },
            include: { student: true, group: true },
          });
        }
      }
    }

    if (!attendance) throw new NotFoundException('تعذر العثور على أو إنشاء سجل الحضور للطالب');

    const validRecordedById = await this.resolveValidUserId(assistantId);

    const assessment = await this.prisma.sessionAssessment.upsert({
      where: { attendanceId: attendance.id },
      update: {
        homeworkStatus: dto.homeworkStatus,
        quizScore: dto.quizScore,
        quizTotal: dto.quizTotal || 10,
        behaviorNotes: dto.behaviorNotes,
        recordedById: validRecordedById,
      },
      create: {
        tenantId,
        attendanceId: attendance.id,
        studentId: attendance.studentId,
        recordedById: validRecordedById,
        homeworkStatus: dto.homeworkStatus,
        quizScore: dto.quizScore,
        quizTotal: dto.quizTotal || 10,
        behaviorNotes: dto.behaviorNotes,
      },
    });

    // إرسال تقرير الواجب والتسميع لولي الأمر عبر الواتساب إذا طُلب ذلك
    if (dto.sendWhatsAppReport && attendance.student.guardianPhone) {
      const hwText = dto.homeworkStatus === 'DONE' ? 'كامل وممتاز' : dto.homeworkStatus === 'INCOMPLETE' ? 'ناقص' : 'لم يسلم الواجب';
      const quizText = dto.quizScore !== undefined ? `وحصل على ${dto.quizScore} من ${dto.quizTotal || 10} في اختبار الحصة.` : '';

      await this.prisma.whatsAppMessage.create({
        data: {
          tenantId,
          recipient: attendance.student.guardianPhone,
          templateKey: 'SESSION_ASSESSMENT_REPORT',
          content: `تقرير حصة اليوم للطالب (${attendance.student.name}): الواجب (${hwText}) ${quizText}`,
        },
      });

      await this.prisma.sessionAssessment.update({
        where: { id: assessment.id },
        data: { whatsappReportSent: true },
      });
    }

    return assessment;
  }

  // تسجيل غياب طالب ورصد الإنذارات التلقائية
  async recordAbsence(tenantId: string, studentId: string, groupId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
    });
    if (!student) throw new NotFoundException('الطالب غير موجود');

    const updatedStudent = await this.prisma.student.update({
      where: { id: student.id },
      data: { consecutiveAbsences: { increment: 1 } },
    });

    const absenceCount = updatedStudent.consecutiveAbsences;

    // تسجيل الحضور كـ غياب
    await this.prisma.attendance.create({
      data: {
        tenantId,
        studentId: student.id,
        groupId,
        status: AttendanceStatus.ABSENT,
      },
    });

    // رصد إنذار الغياب
    let warningLevel: WarningLevel = WarningLevel.FIRST_WARNING;
    if (absenceCount >= 3) warningLevel = WarningLevel.SUSPENDED;
    else if (absenceCount === 2) warningLevel = WarningLevel.SECOND_WARNING;

    await this.prisma.absenceWarning.create({
      data: {
        tenantId,
        studentId: student.id,
        level: warningLevel,
        consecutiveDays: absenceCount,
      },
    });

    // إرسال إنذار فوري لولي الأمر
    if (student.guardianPhone) {
      const warningText =
        absenceCount >= 2
          ? `⚠️ تحذير هام من السنتر: تغيب الطالب (${student.name}) لـ (${absenceCount}) حصص متتالية. يرجى التواصل مع إدارة السنتر لتجنب إيقاف حضوره.`
          : `نود إبلاغكم بغياب الطالب (${student.name}) عن حضور حصة اليوم.`;

      await this.prisma.whatsAppMessage.create({
        data: {
          tenantId,
          recipient: student.guardianPhone,
          templateKey: 'ABSENCE_WARNING',
          content: warningText,
        },
      });
    }

    return {
      studentName: student.name,
      consecutiveAbsences: absenceCount,
      warningLevel,
    };
  }

  async batchSyncOffline(tenantId: string, assistantId: string, dto: BatchOfflineSyncDto) {
    const validScannedById = await this.resolveValidUserId(assistantId);
    const results = [];
    for (const item of dto.items) {
      try {
        const student = await this.prisma.student.findUnique({
          where: { tenantId_studentCode: { tenantId, studentCode: item.studentCode } },
        });

        if (student) {
          const attendance = await this.prisma.attendance.create({
            data: {
              tenantId,
              studentId: student.id,
              groupId: item.groupId,
              scannedById: validScannedById,
              status: item.status,
              scannedAt: new Date(item.scannedAt),
              isOfflineSynced: true,
            },
          });
          results.push({ studentCode: item.studentCode, synced: true, attendanceId: attendance.id });
        }
      } catch (err: any) {
        results.push({ studentCode: item.studentCode, synced: false, error: err.message });
      }
    }
    return results;
  }

  async getGroupAttendance(tenantId: string, groupId: string, dateStr?: string) {
    const targetDate = dateStr ? new Date(dateStr) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const currentMonthNumber = targetDate.getMonth() + 1;
    const startOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    const endOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59, 999);

    const attendances = await this.prisma.attendance.findMany({
      where: {
        tenantId,
        groupId,
        scannedAt: { gte: startOfDay, lte: endOfDay },
      },
      include: {
        student: {
          include: {
            monthlySubs: {
              where: { groupId, monthNumber: currentMonthNumber },
            },
            attendances: {
              where: {
                groupId,
                scannedAt: { gte: startOfMonth, lte: endOfMonth },
              },
              select: { id: true, scannedAt: true },
            },
          },
        },
        group: {
          select: { id: true, name: true, pricePerSession: true, monthlyFee: true },
        },
        scannedBy: { select: { name: true } },
        assessment: true,
      },
      orderBy: { scannedAt: 'asc' },
    });

    return attendances.map((att: any) => {
      const monthAttendanceCount = att.student?.attendances?.length || 1;
      const currentSub = att.student?.monthlySubs?.[0];
      const isPaid = !!currentSub?.isPaid;

      return {
        ...att,
        monthStats: {
          monthNumber: currentMonthNumber,
          attendedSessions: monthAttendanceCount,
          isPaid,
          paidAt: currentSub?.paidAt || null,
          subAmount: currentSub?.amount ? Number(currentSub.amount) : Number(att.group?.monthlyFee || 0),
          sessionPrice: Number(att.group?.pricePerSession || 0),
        },
      };
    });
  }
}
