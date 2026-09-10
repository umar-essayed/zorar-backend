import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getApps, initializeApp, cert, App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import * as fs from 'fs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

const FIREBASE_ADMIN_CREDENTIALS: any = {
  type: "service_account",
  project_id: "eduzorar",
  private_key_id: "16fc889541509bf3ff122f428d0ae502dc7e76e5",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDfAutNf2l0xyp+\nsX68TdIRnKsqeLiv6wi2TMrVO+xP8b3ObG5CtEhJ6QoOih2NMXFi8MJhjFItoWq0\nlt9AY3QW2qw68EhX9lDjNQdu7cevsUUng4cjDmI7tiHi3XgZMAG/HU3nGJCPfGHy\nUt3Tpqw7kKYsEBG0NXS5ZrXjBnlBJm7+dlwJDYOk2Gq07RYcgZpJQslDivMayMgG\nXiN9h6BBp2z3O59pqN9+WnMSEf5z6SOzFa1E2PUxBdPWSwHAm8IaGeQgbbFiF4Zm\nv9yGqoG3cGF/r835MndMV7zbBIYicD/tBDVIZYeHZz7rm+DSJc8yq0DO335ZSUuo\nmT9aAXjjAgMBAAECggEAWoWq0ZhITBiUDT0q/nBwNqnraJ/8B5xVuvnM02UxdPnh\nW6rzzquzNB0d8ezqNee96LVlkYcNzGvbDla3ZEF6W9SDWKE0HFBlYPSjgcmO5qgE\nNBfVgMtT4Hz7oETZfQ/ZhaP1fTqhYzzP3Tb5x/G9s6fxa61SIl4YdTFV30M/cMvR\nAC/LX/1MChv7RyE4neIWZp8zJFYf78iXBCGN2CAmAVAibt2R2jMz6zt599Mlqm9U\nAsae4spfjsECZ9nBt57dxZl0MaVSIG7z3iGFpAME8i6VJaw8AYj4HC1q1epfG9Ra\na438ZvKDtSB8YNVuZY2kLyMaUlCI7EAHI1lcg+DSgQKBgQDx/HOdvzf5Olm7k3ox\n42AX20PyY33yHrtyBr/9TofUYtJhYCsZRleQL/DAFWwY/bGQ1V8P6d4d+YmP4Yh4\nH/LP2jPPwqyhdUSSbz0+27D8Bk8R8r+YkLfS9TRnL7YuRDPeVilR8HJgnldTSqLI\nWEM+chf4G6uqZTueRVfVyeJ2IQKBgQDr7SiuxxXEPRxqnv1zY3eAOo2OQxAPunk+\njJMtxRW3kgRzyC6ZgJiZK7x3sdNSyXMKqAc+A1ZuqHBNVxbwPNJj5Y/z4vIfyWZX\nU7Uo7AqVtnw4H/g35KYzWfPc02KejygN59dT7XfoxC8HHp39QHjJyrml1xvG5YNW\njX9FwJJGgwKBgGveWzNwb+UbS7C/9vKSJt27kjhUfWoWpPwZYi/qd8YHHzzk/5FO\nt+3AURNu+TbSr/qeArg3ShoWiGmo4Yqaw0RAQmRUpVt7yMt15tlEWUqfDVQ034+E\nw0y4nVl5/T32jSCJS/YItxO2wbqRRKsGHUOS3Hhu7UERy1esFZFpYxfBAoGBAKbk\nJRs+Cc+/yxJBVdkCS86RnQE9v2bg6lOs7ZA7EpnA2RVuTkiYB1qS7cdeK7csegzX\nwAfGJKYy0P5k1P0siUfRZHuJ1u1Vcufjdwtzrikp5cVuGBCx1kANKczUW7b+Xb84\necINAf3OidXneqtjqA5XMex2tleEk9vuTFHzX4YxAoGAO21MSVVpV+rk/ExvREs+\nb8RSZ4DC+5HhZbxlJY0IFnDrWa8iVl4z3WUZkTkeNJGbXFqS5MGOy3tRhRMzeF6U\nS3B4K9FgZhZDvqr+JLU4Z/K6LD0Uy47RB9c2HnGWrU6IygoKAl+ZzGQe7/w+2J4q\nTb5m4RvVIEzba42tc4VsEnM=\n-----END PRIVATE KEY-----\n",
  client_email: "firebase-adminsdk-fbsvc@eduzorar.iam.gserviceaccount.com",
  client_id: "115299182740855475773",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40eduzorar.iam.gserviceaccount.com",
  universe_domain: "googleapis.com"
};

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
          credential: cert(FIREBASE_ADMIN_CREDENTIALS),
          projectId: 'eduzorar',
        });
        this.logger.log('Firebase Admin initialized successfully using service account credentials');
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
