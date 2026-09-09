import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateStorefrontDto } from './dto/update-storefront.dto';

@Injectable()
export class StorefrontService {
  constructor(private prisma: PrismaService) {}

  async updateStorefront(tenantId: string, dto: any) {
    const { portalFeatures, ...configData } = dto;

    if (portalFeatures) {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      const currentSettings = (tenant?.settings as Record<string, any>) || {};
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          settings: {
            ...currentSettings,
            portalFeatures,
          },
        },
      });
    }

    return this.prisma.storefrontConfig.upsert({
      where: { tenantId },
      update: {
        ...configData,
      },
      create: {
        tenantId,
        ...configData,
      },
    });
  }

  async getPublicStorefront(hostOrSubdomain: string) {
    let tenant = await this.prisma.tenant.findUnique({
      where: { subdomain: hostOrSubdomain.toLowerCase() },
      include: {
        storefrontConfig: true,
        teachers: {
          where: { isActive: true },
          select: { id: true, name: true, bio: true, avatarUrl: true, subject: true },
        },
        courses: {
          where: { isPublished: true },
          select: {
            id: true,
            title: true,
            slug: true,
            description: true,
            thumbnailUrl: true,
            price: true,
            academicYear: true,
            subject: true,
            teacher: { select: { name: true, avatarUrl: true } },
          },
        },
      },
    });

    if (!tenant) {
      tenant = await this.prisma.tenant.findUnique({
        where: { customDomain: hostOrSubdomain.toLowerCase() },
        include: {
          storefrontConfig: true,
          teachers: {
            where: { isActive: true },
            select: { id: true, name: true, bio: true, avatarUrl: true, subject: true },
          },
          courses: {
            where: { isPublished: true },
            select: {
              id: true,
              title: true,
              slug: true,
              description: true,
              thumbnailUrl: true,
              price: true,
              academicYear: true,
              subject: true,
              teacher: { select: { name: true, avatarUrl: true } },
            },
          },
        },
      });
    }

    if (!tenant) {
      tenant = await this.prisma.tenant.findFirst({
        where: { isActive: true },
        include: {
          storefrontConfig: true,
          teachers: {
            where: { isActive: true },
            select: { id: true, name: true, bio: true, avatarUrl: true, subject: true },
          },
          courses: {
            where: { isPublished: true },
            select: {
              id: true,
              title: true,
              slug: true,
              description: true,
              thumbnailUrl: true,
              price: true,
              academicYear: true,
              subject: true,
              teacher: { select: { name: true, avatarUrl: true } },
            },
          },
        },
      });
    }

    if (!tenant || !tenant.isActive) {
      throw new NotFoundException('المنصة غير موجودة أو معطلة');
    }

    const currentSettings = (tenant.settings as Record<string, any>) || {};
    const portalFeatures = currentSettings.portalFeatures || {
      enableOnlineVideos: true,
      enableOnlineQuizzes: true,
      enableOnlineBookStore: true,
      enableOnlinePayments: true,
    };

    const platformUrl = tenant.customDomain
      ? `https://${tenant.customDomain}`
      : `https://${tenant.subdomain}.zoraredu.com`;

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      plan: tenant.plan,
      subdomain: tenant.subdomain,
      customDomain: tenant.customDomain,
      platformUrl,
      portalFeatures,
      config: tenant.storefrontConfig || {
        heroTitle: `أهلاً بكم في ${tenant.name}`,
        heroSubtitle: 'المنصة التعليمية الرسمية',
        primaryColor: '#2563eb',
        secondaryColor: '#1e40af',
        accentColor: '#f59e0b',
        fontFamily: 'Cairo',
        themeMode: 'light',
      },
      featuredCourses: tenant.courses,
      teachers: tenant.teachers,
    };
  }
}

