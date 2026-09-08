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
    return this.prisma.teacher.findMany({
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
            _count: { select: { students: true, attendances: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTeacherById(tenantId: string, id: string) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id, tenantId },
      include: {
        subject: true,
        groups: true,
        books: true,
        courses: true,
        payouts: { orderBy: { paidAt: 'desc' }, take: 10 },
      },
    });
    if (!teacher) throw new NotFoundException('المدرس غير موجود');
    return teacher;
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

    // جلب كل حضور طلاب مجموعات هذا المدرس خلال الفترة
    const groupIds = teacher.groups.map((g) => g.id);
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
    const teacher = await this.prisma.teacher.findFirst({ where: { id, tenantId } });
    if (!teacher) throw new NotFoundException('المدرس غير موجود');
    return this.prisma.teacher.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.phone ? { phone: dto.phone } : {}),
        ...(dto.subjectId ? { subjectId: dto.subjectId } : {}),
        ...(dto.commissionType ? { commissionType: dto.commissionType } : {}),
        ...(dto.centerPercentage !== undefined ? { centerPercentage: dto.centerPercentage } : {}),
        ...(dto.fixedCenterFee !== undefined ? { fixedCenterFee: dto.fixedCenterFee } : {}),
        ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
      },
      include: { subject: true },
    });
  }

  async deleteTeacher(tenantId: string, id: string) {
    const teacher = await this.prisma.teacher.findFirst({ where: { id, tenantId } });
    if (!teacher) throw new NotFoundException('المدرس غير موجود');
    return this.prisma.teacher.update({
      where: { id },
      data: { isActive: false },
    });
  }
}

