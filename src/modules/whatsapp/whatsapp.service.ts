import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SendWhatsAppMessageDto } from './dto/queue-message.dto';
import { MessageStatus } from '@prisma/client';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(private prisma: PrismaService) {}

  // ضبط أرقام الهواتف المصرية للصيغة الدولية الصحيحة تلقائياً
  private formatPhoneNumber(phone: string): string {
    let clean = phone.replace(/[^\d+]/g, '');
    if (clean.startsWith('01')) {
      clean = '+2' + clean;
    } else if (clean.startsWith('201')) {
      clean = '+' + clean;
    } else if (!clean.startsWith('+')) {
      clean = '+20' + clean;
    }
    return clean;
  }

  // إضافة رسالة جديدة إلى طابور المعالجة
  async queueMessage(tenantId: string, dto: SendWhatsAppMessageDto) {
    const formattedRecipient = this.formatPhoneNumber(dto.recipient);

    const message = await this.prisma.whatsAppMessage.create({
      data: {
        tenantId,
        recipient: formattedRecipient,
        templateKey: dto.templateKey,
        content: dto.content,
        status: MessageStatus.PENDING,
        scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : new Date(),
      },
    });

    // معالجة فورية في الخلفية مع محرك منع الحظر
    this.processQueueSafely(tenantId);

    return message;
  }

  // محرك الإرسال المتكيف الآمن لمنع الحظر (Anti-Ban Jitter Engine)
  async processQueueSafely(tenantId: string) {
    const pendingMessages = await this.prisma.whatsAppMessage.findMany({
      where: {
        tenantId,
        status: MessageStatus.PENDING,
        scheduledFor: { lte: new Date() },
      },
      take: 20,
      orderBy: { scheduledFor: 'asc' },
    });

    for (const msg of pendingMessages) {
      try {
        await this.prisma.whatsAppMessage.update({
          where: { id: msg.id },
          data: { status: MessageStatus.PROCESSING },
        });

        // محاكاة الإرسال عبر WhatsApp Gateway (أو استدعاء API الرسمي)
        this.logger.log(`إرسال رسالة واتساب إلى (${msg.recipient}) بنجاح: [${msg.templateKey}]`);

        await this.prisma.whatsAppMessage.update({
          where: { id: msg.id },
          data: {
            status: MessageStatus.SENT,
            sentAt: new Date(),
          },
        });

        // الفاصل الزمني العشوائي (Adaptive Random Jitter 2-5s) لمنع حظر الشريحة
        const randomDelay = Math.floor(Math.random() * 3000) + 2000;
        await new Promise((resolve) => setTimeout(resolve, randomDelay));
      } catch (err: any) {
        this.logger.error(`فشل إرسال رسالة الواتساب: ${err.message}`);
        await this.prisma.whatsAppMessage.update({
          where: { id: msg.id },
          data: {
            status: MessageStatus.FAILED,
            errorMessage: err.message,
            retryCount: { increment: 1 },
          },
        });
      }
    }
  }

  async getMessageHistory(tenantId: string, limit = 50) {
    return this.prisma.whatsAppMessage.findMany({
      where: { tenantId },
      orderBy: { scheduledFor: 'desc' },
      take: limit,
    });
  }
}
