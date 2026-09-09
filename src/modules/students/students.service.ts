import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { CreateStudentDto, BatchImportStudentsDto } from './dto/create-student.dto';

@Injectable()
export class StudentsService {
  constructor(
    private prisma: PrismaService,
    private tenantService: TenantService,
  ) {}

  private generateStudentCode(): string {
    return Math.floor(10000 + Math.random() * 90000).toString();
  }

  private generateQRPayload(tenantId: string, studentCode: string): string {
    const secret = process.env.JWT_SECRET || 'zorar-qr-secret';
    const hmac = crypto.createHmac('sha256', secret).update(`${tenantId}:${studentCode}`).digest('hex').substring(0, 10);
    return `ZORAR:${tenantId}:${studentCode}:${hmac}`;
  }

  async createStudent(tenantId: string, dto: CreateStudentDto) {
    // 1. خصم نقطة من رصيد الكوتا بنظام Pay-As-You-Go
    await this.tenantService.deductQuota(tenantId, 1, 'STUDENT_ADMISSION');

    let studentCode = dto.studentCode;
    if (!studentCode) {
      let isUnique = false;
      while (!isUnique) {
        studentCode = this.generateStudentCode();
        const exists = await this.prisma.student.findUnique({
          where: { tenantId_studentCode: { tenantId, studentCode } },
        });
        if (!exists) isUnique = true;
      }
    } else {
      const exists = await this.prisma.student.findUnique({
        where: { tenantId_studentCode: { tenantId, studentCode } },
      });
      if (exists) throw new ConflictException(`كود الطالب (${studentCode}) مستخدم بالفعل`);
    }

    let academicYearId = dto.academicYearId;
    if (!academicYearId || academicYearId.trim() === '') {
      let year = await this.prisma.academicYear.findFirst({ where: { tenantId } });
      if (!year) {
        year = await this.prisma.academicYear.create({
          data: {
            tenantId,
            name: 'الصف الدراسي الأساسي',
          },
        });
      }
      academicYearId = year.id;
    }

    const qrPayload = this.generateQRPayload(tenantId, studentCode);

    return this.prisma.$transaction(async (tx) => {
      const student = await tx.student.create({
        data: {
          tenantId,
          studentCode,
          name: dto.name,
          phone: dto.phone,
          guardianPhone: dto.guardianPhone,
          academicYearId,
          schoolName: dto.schoolName,
          notes: dto.notes,
        },
      });

      // إنشاء كارت الـ QR الميداني المشفر
      await tx.studentCard.create({
        data: {
          tenantId,
          studentId: student.id,
          qrPayload,
          barcode: studentCode,
        },
      });

      // التسكين في قائمة المجموعات المختارة
      if (dto.groupIds && dto.groupIds.length > 0) {
        const currentMonthNumber = new Date().getMonth() + 1;
        const MONTH_NAMES = [
          'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
          'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
        ];
        const monthName = `شهر ${MONTH_NAMES[currentMonthNumber - 1]} ${new Date().getFullYear()}`;

        for (const groupId of dto.groupIds) {
          await tx.studentGroup.create({
            data: {
              studentId: student.id,
              groupId,
            },
          });

          const groupObj = await tx.group.findUnique({ where: { id: groupId } });
          if (groupObj) {
            const isFirstGroupPaid =
              dto.groupIds.indexOf(groupId) === 0 &&
              dto.initialPayment &&
              Number(dto.initialPayment.amount) > 0 &&
              (!dto.initialPayment.type || dto.initialPayment.type === 'MONTHLY_SUBSCRIPTION');

            await tx.monthlySubscription.upsert({
              where: {
                studentId_groupId_monthNumber: {
                  studentId: student.id,
                  groupId,
                  monthNumber: currentMonthNumber,
                },
              },
              update: {
                isPaid: isFirstGroupPaid,
                paidAt: isFirstGroupPaid ? new Date() : null,
              },
              create: {
                tenantId,
                studentId: student.id,
                groupId,
                monthNumber: currentMonthNumber,
                monthName,
                amount: groupObj.monthlyFee || 0,
                isPaid: isFirstGroupPaid,
                paidAt: isFirstGroupPaid ? new Date() : null,
              },
            });
          }
        }
      }

      // تسجيل الدفعة المالية الأولية إن وُجدت وربطها بالوجهة بدقة
      if (dto.initialPayment && Number(dto.initialPayment.amount) > 0) {
        const pAmount = Number(dto.initialPayment.amount);
        const pType = (dto.initialPayment.type as any) || 'MONTHLY_SUBSCRIPTION';
        const pMethod = (dto.initialPayment.method as any) || 'CASH';
        let pDesc = dto.initialPayment.description || 'دفعة أولية عند تسجيل الطالب';
        const receiptNo = `REC-${Date.now().toString().slice(-6)}`;

        let firstGrp: any = null;
        if (dto.groupIds && dto.groupIds.length > 0) {
          firstGrp = await tx.group.findUnique({
            where: { id: dto.groupIds[0] },
            include: { subject: true, teacher: true },
          });
          if (firstGrp) {
            pDesc = `${pDesc} • [مجموعة: ${firstGrp.name}] [المادة: ${firstGrp.subject?.name || '-'}] [المدرس: ${firstGrp.teacher?.name || '-'}]`;
          }
        } else {
          pDesc = `${pDesc} • [خزينة السنتر العامة]`;
        }

        await tx.transaction.create({
          data: {
            tenantId,
            studentId: student.id,
            groupId: firstGrp ? firstGrp.id : null,
            teacherId: firstGrp ? firstGrp.teacherId : null,
            subjectId: firstGrp ? firstGrp.subjectId : null,
            academicYearId: firstGrp ? firstGrp.academicYearId : null,
            amount: pAmount,
            type: pType,
            method: pMethod,
            description: pDesc,
            receiptNo,
          },
        });
      }

      return tx.student.findUnique({
        where: { id: student.id },
        include: {
          card: true,
          groups: { include: { group: { include: { subject: true, teacher: true } } } },
          academicYear: true,
          transactions: { orderBy: { createdAt: 'desc' }, take: 5 },
        },
      });
    });
  }

  async batchImport(tenantId: string, dto: BatchImportStudentsDto) {
    const results = [];
    for (const studentDto of dto.students) {
      try {
        const student = await this.createStudent(tenantId, studentDto);
        results.push({ success: true, student });
      } catch (err: any) {
        results.push({ success: false, name: studentDto.name, error: err.message });
      }
    }
    return results;
  }

  async getStudents(tenantId: string, search?: string, groupId?: string, teacherId?: string) {
    return this.prisma.student.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { studentCode: { contains: search } },
                { phone: { contains: search } },
                { guardianPhone: { contains: search } },
              ],
            }
          : {}),
        ...(groupId
          ? {
              groups: { some: { groupId } },
            }
          : {}),
        ...(teacherId
          ? {
              groups: { some: { group: { teacherId } } },
            }
          : {}),
      },
      include: {
        card: true,
        academicYear: true,
        groups: { include: { group: { include: { teacher: true, subject: true } } } },
        monthlySubs: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getStudentById(tenantId: string, id: string) {
    const student = await this.prisma.student.findFirst({
      where: { id, tenantId },
      include: {
        card: true,
        academicYear: true,
        groups: { include: { group: { include: { teacher: true, subject: true } } } },
        monthlySubs: true,
        attendances: {
          take: 20,
          orderBy: { scannedAt: 'desc' },
          include: {
            group: { select: { id: true, name: true } },
            session: { select: { id: true, sessionNumber: true, title: true, scheduledDate: true } },
          },
        },
        transactions: { take: 10, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!student) throw new NotFoundException('الطالب غير موجود');
    return student;
  }

  async getStudentCardQRBase64(tenantId: string, studentId: string) {
    const card = await this.prisma.studentCard.findFirst({
      where: { studentId, tenantId },
      include: { student: true },
    });
    if (!card) throw new NotFoundException('كارت الطالب غير موجود');

    const qrDataUrl = await QRCode.toDataURL(card.qrPayload, {
      margin: 1,
      width: 400,
      color: { dark: '#000000', light: '#ffffff' },
    });

    return {
      studentCode: card.student.studentCode,
      name: card.student.name,
      qrDataUrl,
      barcode: card.barcode,
    };
  }

  async updateStudent(tenantId: string, id: string, dto: any) {
    const student = await this.prisma.student.findFirst({ where: { id, tenantId } });
    if (!student) throw new NotFoundException('الطالب غير موجود');

    // مزامنة المجموعات إذا تم تمريرها
    if (Array.isArray(dto.groupIds)) {
      await this.prisma.studentGroup.deleteMany({ where: { studentId: id } });
      for (const gid of dto.groupIds) {
        if (gid) {
          await this.prisma.studentGroup.create({
            data: { studentId: id, groupId: gid },
          }).catch(() => {});
        }
      }
    } else if (dto.groupId) {
      const existing = await this.prisma.studentGroup.findUnique({
        where: { studentId_groupId: { studentId: id, groupId: dto.groupId } },
      });
      if (!existing) {
        await this.prisma.studentGroup.deleteMany({ where: { studentId: id } });
        await this.prisma.studentGroup.create({
          data: { studentId: id, groupId: dto.groupId },
        }).catch(() => {});
      }
    }

    return this.prisma.student.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.phone ? { phone: dto.phone } : {}),
        ...(dto.guardianPhone ? { guardianPhone: dto.guardianPhone } : {}),
        ...(dto.academicYearId ? { academicYearId: dto.academicYearId } : {}),
        ...(dto.schoolName !== undefined ? { schoolName: dto.schoolName } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: {
        card: true,
        academicYear: true,
        groups: { include: { group: true } },
        monthlySubs: true,
      },
    });
  }

  async deleteStudent(tenantId: string, id: string) {
    const student = await this.prisma.student.findFirst({ where: { id, tenantId } });
    if (!student) throw new NotFoundException('الطالب غير موجود');
    return this.prisma.student.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async getStudentProfile(tenantId: string, id: string) {
    const student = await this.prisma.student.findFirst({
      where: { id, tenantId },
      include: {
        card: true,
        academicYear: true,
        groups: {
          include: {
            group: {
              include: {
                subject: true,
                teacher: true,
              },
            },
          },
        },
        monthlySubs: {
          include: {
            group: {
              select: { id: true, name: true, pricePerSession: true, monthlyFee: true },
            },
          },
          orderBy: { monthNumber: 'desc' },
        },
        transactions: {
          include: {
            assistant: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        attendances: {
          include: {
            group: { select: { id: true, name: true } },
            session: { select: { id: true, sessionNumber: true, title: true, scheduledDate: true } },
            assessment: true,
          },
          orderBy: { scannedAt: 'desc' },
          take: 30,
        },
        assessments: {
          include: {
            attendance: {
              include: { group: { select: { id: true, name: true } } },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        videoWatchLogs: {
          include: {
            lesson: { select: { title: true } },
          },
          orderBy: { lastWatchedAt: 'desc' },
          take: 10,
        },
        courseAccess: {
          include: {
            course: { select: { title: true } },
          },
        },
        examSubmissions: {
          include: {
            exam: { select: { title: true, totalScore: true } },
          },
          orderBy: { submittedAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!student) throw new NotFoundException('الطالب غير موجود');

    const hasPlatformNote = !!student.notes && student.notes.includes('[PLATFORM_REGISTERED');
    const hasVideoLogs = (student.videoWatchLogs?.length || 0) > 0;
    const hasCourseAccess = (student.courseAccess?.length || 0) > 0;
    const hasExams = (student.examSubmissions?.length || 0) > 0;
    const isPlatformActive = hasPlatformNote || hasVideoLogs || hasCourseAccess || hasExams;

    const totalPaid = student.transactions.reduce((acc: number, t: any) => acc + Number(t.amount || 0), 0);

    return {
      ...student,
      platformStatus: {
        isRegistered: isPlatformActive,
        registeredLabel: isPlatformActive ? 'مسجل ونشط على المنصة 🌐' : 'لم يسجل على المنصة بعد ⚠️',
        watchLogsCount: student.videoWatchLogs?.length || 0,
        courseAccessCount: student.courseAccess?.length || 0,
        examSubmissionsCount: student.examSubmissions?.length || 0,
      },
      financialSummary: {
        totalPaid,
        walletBalance: Number(student.walletBalance || 0),
        groupsCount: student.groups.length,
        monthlySubsCount: student.monthlySubs.length,
      },
    };
  }

  async enrollInGroup(
    tenantId: string,
    studentId: string,
    dto: { groupId: string; discountPercent?: number; initialMonthPaid?: boolean },
  ) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, tenantId } });
    if (!student) throw new NotFoundException('الطالب غير موجود');

    const group = await this.prisma.group.findFirst({ where: { id: dto.groupId, tenantId } });
    if (!group) throw new NotFoundException('المجموعة غير موجودة');

    const existing = await this.prisma.studentGroup.findUnique({
      where: { studentId_groupId: { studentId, groupId: dto.groupId } },
    });

    if (existing) {
      throw new ConflictException('الطالب مقيد بالفعل في هذه المجموعة');
    }

    const currentMonthNumber = new Date().getMonth() + 1;
    const MONTH_NAMES = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
    ];
    const monthName = `شهر ${MONTH_NAMES[currentMonthNumber - 1]} ${new Date().getFullYear()}`;

    const studentGroup = await this.prisma.studentGroup.create({
      data: {
        studentId,
        groupId: dto.groupId,
        isDiscounted: !!dto.discountPercent,
        discountPercent: dto.discountPercent || null,
      },
      include: {
        group: { include: { subject: true, teacher: true } },
      },
    });

    await this.prisma.monthlySubscription.upsert({
      where: {
        studentId_groupId_monthNumber: {
          studentId,
          groupId: dto.groupId,
          monthNumber: currentMonthNumber,
        },
      },
      update: {
        isPaid: !!dto.initialMonthPaid,
        paidAt: dto.initialMonthPaid ? new Date() : null,
        amount: group.monthlyFee || 0,
      },
      create: {
        tenantId,
        studentId,
        groupId: dto.groupId,
        monthNumber: currentMonthNumber,
        monthName,
        amount: group.monthlyFee || 0,
        isPaid: !!dto.initialMonthPaid,
        paidAt: dto.initialMonthPaid ? new Date() : null,
      },
    });

    if (dto.initialMonthPaid && Number(group.monthlyFee || 0) > 0) {
      const receiptNo = `REC-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
      const destLabel = `[مجموعة: ${group.name}] [المادة: ${studentGroup.group?.subject?.name || '-'}] [المدرس: ${studentGroup.group?.teacher?.name || '-'}]`;
      await this.prisma.transaction.create({
        data: {
          tenantId,
          studentId,
          groupId: dto.groupId,
          teacherId: group.teacherId || studentGroup.group?.teacherId || null,
          subjectId: group.subjectId || studentGroup.group?.subjectId || null,
          academicYearId: group.academicYearId || studentGroup.group?.academicYearId || null,
          amount: group.monthlyFee || 0,
          type: 'MONTHLY_SUBSCRIPTION',
          method: 'CASH',
          receiptNo,
          description: `سداد اشتراك ${monthName} عند التسكين بالمجموعة • ${destLabel}`,
        },
      });
    }

    return studentGroup;
  }

  async unenrollFromGroup(tenantId: string, studentId: string, groupId: string) {
    const existing = await this.prisma.studentGroup.findUnique({
      where: { studentId_groupId: { studentId, groupId } },
    });
    if (!existing) throw new NotFoundException('الطالب غير مقيد في هذه المجموعة');

    await this.prisma.studentGroup.delete({
      where: { studentId_groupId: { studentId, groupId } },
    });

    await this.prisma.monthlySubscription.deleteMany({
      where: {
        studentId,
        groupId,
        isPaid: false,
      },
    });

    return { success: true, message: 'تم إلغاء الاشتراك وتصفية المجموعة بنجاح' };
  }

  async recordStudentPayment(
    tenantId: string,
    assistantId: string,
    studentId: string,
    dto: {
      groupId?: string;
      monthNumber?: number;
      amount: number;
      type: 'MONTHLY_SUBSCRIPTION' | 'LESSON_SESSION_FEE';
      method?: 'CASH' | 'VODAFONE_CASH' | 'INSTAPAY' | 'CREDIT_CARD';
      description?: string;
    },
  ) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, tenantId } });
    if (!student) throw new NotFoundException('الطالب غير موجود');

    const receiptNo = `REC-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    const MONTH_NAMES = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
    ];

    return this.prisma.$transaction(async (tx: any) => {
      let finalDescription = dto.description;
      let targetGroup: any = null;

      if (dto.groupId) {
        targetGroup = await tx.group.findFirst({
          where: { id: dto.groupId, tenantId },
          include: { subject: true, teacher: true },
        });
      }

      const destLabel = targetGroup
        ? `[مجموعة: ${targetGroup.name}] [المادة: ${targetGroup.subject?.name || '-'}] [المدرس: ${targetGroup.teacher?.name || '-'}]`
        : '[خزينة السنتر العامة]';

      if (dto.type === 'MONTHLY_SUBSCRIPTION') {
        if (!dto.groupId) {
          throw new BadRequestException('يجب تحديد المجموعة الدراسية لتسجيل سداد اشتراك الشهر.');
        }
        if (!dto.monthNumber || dto.monthNumber < 1 || dto.monthNumber > 12) {
          throw new BadRequestException('يرجى تحديد شهر دراسي صحيح بين 1 و 12.');
        }

        const monthLabel = `شهر ${MONTH_NAMES[dto.monthNumber - 1]} ${new Date().getFullYear()}`;

        // 1. التحقق المالي الصارم لمنع الازدواج المالي وسداد نفس الشهر مرتين
        const existingSub = await tx.monthlySubscription.findUnique({
          where: {
            studentId_groupId_monthNumber: {
              studentId,
              groupId: dto.groupId,
              monthNumber: dto.monthNumber,
            },
          },
        });

        if (existingSub && existingSub.isPaid) {
          const paidDateStr = existingSub.paidAt
            ? new Date(existingSub.paidAt).toLocaleDateString('ar-EG')
            : '';
          throw new BadRequestException(
            `عفواً، لا يمكن إتمام السداد! اشتراك (${monthLabel}) لمجموعة (${targetGroup?.name || 'المحددة'}) مسدد بالفعل مسبقاً لهذا الطالب${paidDateStr ? ` بتاريخ ${paidDateStr}` : ''} بمبلغ (${existingSub.amount} ج.م). النظام يمنع تكرار سداد نفس الشهر لنفس المجموعة لمنع الازدواج المالي.`,
          );
        }

        finalDescription = `سداد اشتراك ${monthLabel} • ${destLabel}${dto.description ? ` (${dto.description})` : ''}`;

        await tx.monthlySubscription.upsert({
          where: {
            studentId_groupId_monthNumber: {
              studentId,
              groupId: dto.groupId,
              monthNumber: dto.monthNumber,
            },
          },
          update: {
            isPaid: true,
            paidAt: new Date(),
            amount: dto.amount,
          },
          create: {
            tenantId,
            studentId,
            groupId: dto.groupId,
            monthNumber: dto.monthNumber,
            monthName: monthLabel,
            amount: dto.amount,
            isPaid: true,
            paidAt: new Date(),
          },
        });

        // تحويل وتبرئة أي حصص سماح سابقة لهذا الشهر إلى حصص مدفوعة بفضل التجديد
        await tx.attendance.updateMany({
          where: {
            tenantId,
            studentId,
            groupId: dto.groupId,
            isGraceSession: true,
          },
          data: {
            isGraceSession: false,
          },
        });
      } else if (dto.type === 'LESSON_SESSION_FEE') {
        finalDescription = `سداد رسوم حصة • ${destLabel}${dto.description ? ` (${dto.description})` : ''}`;
      } else if (!finalDescription) {
        finalDescription = `سداد مصروفات دراسية • ${destLabel}`;
      } else {
        finalDescription = `${finalDescription} • ${destLabel}`;
      }

      const transaction = await tx.transaction.create({
        data: {
          tenantId,
          studentId: student.id,
          groupId: targetGroup?.id || dto.groupId || null,
          teacherId: targetGroup?.teacherId || null,
          subjectId: targetGroup?.subjectId || null,
          academicYearId: targetGroup?.academicYearId || null,
          assistantId: assistantId || null,
          amount: dto.amount,
          type: (dto.type as any) || 'MONTHLY_SUBSCRIPTION',
          method: (dto.method as any) || 'CASH',
          receiptNo,
          description: finalDescription,
        },
      });

      return {
        success: true,
        receiptNo,
        transaction,
        message: 'تم تسجيل السداد بنجاح وإصدار الإيصال',
      };
    });
  }
}

