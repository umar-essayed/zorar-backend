import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createNotification(tenantId: string, dto: CreateNotificationDto) {
    const notification = await this.prisma.notification.create({
      data: {
        tenantId,
        title: dto.title.trim(),
        body: dto.body.trim(),
        type: (dto.type as any) || 'GENERAL',
        target: (dto.target as any) || 'ALL_STUDENTS',
        groupId: dto.groupId || null,
        studentId: dto.studentId || null,
        actionPayload: dto.actionPayload ? (dto.actionPayload as any) : null,
        isUrgent: dto.isUrgent ?? false,
      },
    });

    return notification;
  }

  async getStudentNotifications(tenantId: string, studentId: string) {
    // جلب مجموعات الطالب الحالية
    const studentGroups = await this.prisma.studentGroup.findMany({
      where: { studentId },
      select: { groupId: true },
    });
    const groupIds = studentGroups.map((g) => g.groupId);

    const notifications = await this.prisma.notification.findMany({
      where: {
        tenantId,
        OR: [
          { target: 'ALL_STUDENTS' },
          ...(groupIds.length > 0 ? [{ groupId: { in: groupIds } }] : []),
          { studentId },
        ],
      },
      include: {
        receipts: {
          where: { studentId },
          select: { readAt: true },
        },
        group: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });

    return notifications.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      type: n.type,
      target: n.target,
      isUrgent: n.isUrgent,
      createdAt: n.createdAt,
      groupName: n.group?.name || null,
      actionPayload: n.actionPayload,
      isRead: n.receipts.length > 0 && n.receipts[0].readAt !== null,
    }));
  }

  async markAsRead(tenantId: string, studentId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, tenantId },
    });
    if (!notification) throw new NotFoundException('الإشعار غير موجود');

    return this.prisma.notificationReceipt.upsert({
      where: {
        notificationId_studentId: {
          notificationId,
          studentId,
        },
      },
      create: {
        notificationId,
        studentId,
        readAt: new Date(),
      },
      update: {
        readAt: new Date(),
      },
    });
  }

  async markAllAsRead(tenantId: string, studentId: string) {
    const studentGroups = await this.prisma.studentGroup.findMany({
      where: { studentId },
      select: { groupId: true },
    });
    const groupIds = studentGroups.map((g) => g.groupId);

    const notifications = await this.prisma.notification.findMany({
      where: {
        tenantId,
        OR: [
          { target: 'ALL_STUDENTS' },
          ...(groupIds.length > 0 ? [{ groupId: { in: groupIds } }] : []),
          { studentId },
        ],
      },
      select: { id: true },
    });

    const now = new Date();
    for (const n of notifications) {
      await this.prisma.notificationReceipt.upsert({
        where: {
          notificationId_studentId: {
            notificationId: n.id,
            studentId,
          },
        },
        create: {
          notificationId: n.id,
          studentId,
          readAt: now,
        },
        update: {
          readAt: now,
        },
      });
    }

    return { success: true, count: notifications.length };
  }

  async getStaffNotifications(tenantId: string) {
    return this.prisma.notification.findMany({
      where: { tenantId },
      include: {
        group: { select: { id: true, name: true } },
        student: { select: { id: true, name: true, studentCode: true } },
        _count: { select: { receipts: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
