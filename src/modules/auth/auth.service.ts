import { Injectable, UnauthorizedException, ConflictException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LoginDto, StudentLoginDto, RegisterUserDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async registerUser(dto: RegisterUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: {
        phone: dto.phone,
        tenantId: dto.tenantId || null,
      },
    });
    if (existing) {
      throw new ConflictException('رقم الهاتف مسجل بالفعل في هذا السنتر');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        passwordHash,
        role: dto.role,
        tenantId: dto.tenantId,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        tenantId: true,
        createdAt: true,
      },
    });
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        phone: dto.phone,
        ...(dto.tenantId ? { tenantId: dto.tenantId } : {}),
      },
      include: { tenant: true, teacherProfile: true },
    });

    if (!user) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    const payload = {
      sub: user.id,
      phone: user.phone,
      role: user.role,
      tenantId: user.tenantId,
      teacherId: user.teacherProfile?.id,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        tenantId: user.tenantId,
        permissions: user.permissions,
        tenant: user.tenant,
        teacherProfile: user.teacherProfile,
      },
    };
  }

  async studentLogin(dto: StudentLoginDto) {
    let tenantId = dto.tenantId;

    if (!tenantId && dto.subdomain) {
      const cleanSub = dto.subdomain.trim().toLowerCase();
      const tenant = await this.prisma.tenant.findFirst({
        where: {
          OR: [
            { subdomain: cleanSub },
            { customDomain: cleanSub },
          ],
        },
      });
      if (!tenant) {
        throw new UnauthorizedException('السنتر أو المنصة المطلوبة غير موجودة');
      }
      tenantId = tenant.id;
    }

    const student = await this.prisma.student.findFirst({
      where: {
        studentCode: dto.studentCode.trim(),
        phone: dto.phone.trim(),
        ...(tenantId ? { tenantId } : {}),
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            plan: true,
            brandingConfig: true,
            subdomain: true,
            customDomain: true,
            storefrontConfig: true,
          },
        },
        academicYear: true,
        groups: {
          include: {
            group: {
              include: {
                subject: true,
                teacher: {
                  select: {
                    id: true,
                    name: true,
                    avatarUrl: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!student || !student.isActive) {
      throw new UnauthorizedException(
        tenantId
          ? 'كود الطالب أو رقم الهاتف غير مسجل في هذا السنتر'
          : 'كود الطالب أو رقم الهاتف غير مسجل في المنظومة'
      );
    }

    // Mark student as platform registered
    if (!student.notes?.includes('[PLATFORM_REGISTERED')) {
      const tag = `[PLATFORM_REGISTERED:${new Date().toISOString()}]`;
      const updatedNotes = student.notes ? `${student.notes} ${tag}` : tag;
      this.prisma.student
        .update({
          where: { id: student.id },
          data: { notes: updatedNotes },
        })
        .catch(() => null);
    }

    const payload = {
      sub: student.id,
      role: 'STUDENT',
      studentCode: student.studentCode,
      tenantId: student.tenantId,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      student: {
        id: student.id,
        studentCode: student.studentCode,
        name: student.name,
        phone: student.phone,
        guardianPhone: student.guardianPhone,
        points: student.points,
        academicYear: student.academicYear,
        groups: student.groups,
        tenant: student.tenant,
      },
    };
  }
}
