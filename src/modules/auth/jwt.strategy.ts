import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'zorar-super-secure-jwt-secret-key-2026',
    });
  }

  private authCache = new Map<string, { data: any; cachedAt: number }>();

  async validate(payload: any) {
    const cacheKey = `${payload.role || 'USER'}:${payload.sub}`;
    const cached = this.authCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < 60_000) {
      return cached.data;
    }

    if (payload.role === 'STUDENT') {
      const student = await this.prisma.student.findUnique({
        where: { id: payload.sub },
        include: { tenant: true },
      });
      if (!student) throw new UnauthorizedException('الطالب غير مسجل');
      const data = {
        id: student.id,
        role: 'STUDENT',
        tenantId: student.tenantId,
        studentCode: student.studentCode,
        name: student.name,
        tenant: student.tenant,
      };
      this.authCache.set(cacheKey, { data, cachedAt: Date.now() });
      return data;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { tenant: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('المستخدم غير موجود أو تم تعطيل حسابه');
    }

    const data = {
      id: user.id,
      role: user.role,
      tenantId: user.tenantId,
      phone: user.phone,
      name: user.name,
      permissions: user.permissions,
      tenant: user.tenant,
    };
    this.authCache.set(cacheKey, { data, cachedAt: Date.now() });
    return data;
  }
}
