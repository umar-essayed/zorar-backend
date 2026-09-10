import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getApps, initializeApp, cert, App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import * as fs from 'fs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private firebaseApp: App | null = null;

  constructor(private readonly prisma: PrismaService) {
    this.initFirebaseAdmin();
  }

  private initFirebaseAdmin() {
    try {
      const apps = getApps();
      if (apps.length > 0) {
        this.firebaseApp = apps[0];
        return;
      }

      const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
      const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 'service-account.json';

      if (serviceAccountJson) {
        const credentials = JSON.parse(serviceAccountJson);
        this.firebaseApp = initializeApp({
          credential: cert(credentials),
          projectId: credentials.project_id || 'eduzorar',
        });
        this.logger.log('Firebase Admin initialized successfully from FIREBASE_SERVICE_ACCOUNT');
      } else if (fs.existsSync(serviceAccountPath)) {
        this.firebaseApp = initializeApp({
          credential: cert(serviceAccountPath),
          projectId: 'eduzorar',
        });
        this.logger.log(`Firebase Admin initialized successfully from ${serviceAccountPath}`);
      } else {
        this.firebaseApp = initializeApp({
          projectId: 'eduzorar',
        });
        this.logger.log('Firebase Admin initialized with default projectId eduzorar');
      }
    } catch (e: any) {
      this.logger.warn(`Could not initialize Firebase Admin: ${e.message}`);
    }
  }

  async registerFcmToken(tenantId: string, studentId: string, token: string) {
    if (!token || !studentId) return { success: false };
    try {
      await this.prisma.student.updateMany({
        where: { id: studentId, tenantId },
        data: { fcmToken: token },
      });
      return { success: true };
    } catch (e: any) {
      this.logger.error(`Failed to save FCM token: ${e.message}`);
      return { success: false };
    }
  }

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

    // إرسال الإشعار اللحظي إلى هواتف الطلاب عبر Firebase Cloud Messaging
    this.dispatchPushNotification(tenantId, notification).catch((err) => {
      this.logger.warn(`Background FCM dispatch error: ${err.message}`);
    });

    return notification;
  }

  private async dispatchPushNotification(
    tenantId: string,
    notification: {
      id: string;
      title: string;
      body: string;
      target: string;
      groupId?: string | null;
      studentId?: string | null;
    },
  ) {
    try {
      if (!this.firebaseApp) {
        this.initFirebaseAdmin();
      }
      if (!this.firebaseApp) return;

      const messaging = getMessaging(this.firebaseApp);
      const cleanTenant = tenantId.replace(/[^a-zA-Z0-9_-]/g, '_');

      // 1. إذا كان الإشعار لجميع طلاب السنتر
      if (notification.target === 'ALL_STUDENTS') {
        const topic = `tenant_${cleanTenant}`;
        await messaging.send({
          topic,
          notification: {
            title: notification.title,
            body: notification.body,
          },
          data: {
            notificationId: notification.id,
            tenantId,
          },
          android: {
            priority: 'high',
            notification: {
              sound: 'default',
              channelId: 'eduzorar_alerts',
            },
          },
        }).catch((err) => this.logger.warn(`Failed sending to topic ${topic}: ${err.message}`));

        // إرسال مباشر أيضاً لرموز أجهزة الطلاب المسجلة في السنتر
        const students = await this.prisma.student.findMany({
          where: { tenantId, fcmToken: { not: null } },
          select: { fcmToken: true },
        });
        const tokens = students.map((s) => s.fcmToken as string).filter(Boolean);
        if (tokens.length > 0) {
          await messaging.sendEachForMulticast({
            tokens,
            notification: {
              title: notification.title,
              body: notification.body,
            },
            data: {
              notificationId: notification.id,
              tenantId,
            },
          }).catch((err) => this.logger.warn(`Failed multicast to students: ${err.message}`));
        }
      } else if (notification.target === 'GROUP_SPECIFIC' && notification.groupId) {
        // 2. إشعار لمجموعة معينة
        const cleanGroup = notification.groupId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const topic = `group_${cleanGroup}`;
        await messaging.send({
          topic,
          notification: {
            title: notification.title,
            body: notification.body,
          },
          data: {
            notificationId: notification.id,
            tenantId,
            groupId: notification.groupId,
          },
          android: {
            priority: 'high',
            notification: {
              sound: 'default',
              channelId: 'eduzorar_alerts',
            },
          },
        }).catch((err) => this.logger.warn(`Failed sending to topic ${topic}: ${err.message}`));

        const groupStudents = await this.prisma.studentGroup.findMany({
          where: { groupId: notification.groupId, student: { fcmToken: { not: null } } },
          include: { student: { select: { fcmToken: true } } },
        });
        const tokens = groupStudents.map((gs) => gs.student.fcmToken as string).filter(Boolean);
        if (tokens.length > 0) {
          await messaging.sendEachForMulticast({
            tokens,
            notification: {
              title: notification.title,
              body: notification.body,
            },
            data: {
              notificationId: notification.id,
              tenantId,
            },
          }).catch((err) => this.logger.warn(`Failed multicast to group: ${err.message}`));
        }
      } else if (notification.studentId) {
        // 3. إشعار فردي لطالب محدد
        const student = await this.prisma.student.findUnique({
          where: { id: notification.studentId },
          select: { fcmToken: true },
        });
        if (student?.fcmToken) {
          await messaging.send({
            token: student.fcmToken,
            notification: {
              title: notification.title,
              body: notification.body,
            },
            data: {
              notificationId: notification.id,
              tenantId,
            },
            android: {
              priority: 'high',
              notification: {
                sound: 'default',
                channelId: 'eduzorar_alerts',
              },
            },
          }).catch((err) => this.logger.warn(`Failed sending to student token: ${err.message}`));
        }
      }
    } catch (err: any) {
      this.logger.error(`Error in dispatchPushNotification: ${err.message}`);
    }
  }

  async getStudentNotifications(tenantId: string, studentId: string) {
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
