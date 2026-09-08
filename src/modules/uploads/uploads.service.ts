import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { randomBytes } from 'crypto';

export interface UploadResult {
  url: string;
  key: string;
  originalName: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly publicDomain: string;

  constructor(private readonly configService: ConfigService) {
    const accountId = this.configService.get<string>('R2_ACCOUNT_ID') || '75f208b7d64533f666f12c10aea785a3';
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID') || 'df5b4ea33d2694f25b5187047e5c4d0f';
    const secretAccessKey =
      this.configService.get<string>('R2_SECRET_ACCESS_KEY') ||
      '41a99229928da4e76ebad1d4cc39f10b97de29c09bc63c9e0060d195577bf4f6';
    const endpoint =
      this.configService.get<string>('R2_ENDPOINT') ||
      `https://${accountId}.r2.cloudflarestorage.com`;

    this.bucketName = this.configService.get<string>('R2_BUCKET_NAME') || 'tenant-storage';
    this.publicDomain = (
      this.configService.get<string>('R2_PUBLIC_DOMAIN') || 'https://media.zorar-code.com'
    ).replace(/\/+$/, '');

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    this.logger.log(`Initialized Cloudflare R2 Client with Bucket: ${this.bucketName}`);
  }

  /**
   * رفع ملف إلى Cloudflare R2 مع عزل تام لكل سنتر / حساب في مجلد فرعي خاص
   * @param tenantId معرف السنتر أو الحساب للعزل
   * @param file الملف المرفوع من Multer
   * @param folder تصنيف الملف (logos, banners, teachers, courses, assignments, materials)
   */
  async uploadFile(
    tenantId: string,
    file: Express.Multer.File,
    folder = 'general',
  ): Promise<UploadResult> {
    if (!file || !file.buffer) {
      throw new BadRequestException('لم يتم استلام أي ملف للرفع');
    }

    // تنظيف اسم المجلد والتصنيف لمنع Path Traversal
    const safeCategory = folder.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'general';
    const safeTenantId = (tenantId || 'global').replace(/[^a-zA-Z0-9_-]/g, '');

    // توليد بادئة واسم فريد للملف
    const timestamp = Date.now();
    const randomSuffix = randomBytes(4).toString('hex');
    const originalExt = this.extractExtension(file.originalname);
    const sanitizedBaseName = this.sanitizeFileName(file.originalname.replace(/\.[^/.]+$/, ''));
    const uniqueFileName = `${timestamp}-${randomSuffix}-${sanitizedBaseName}${originalExt}`;

    // عزل مجلد منفصل لكل حساب: tenants/<tenantId>/<folder>/<fileName>
    const s3Key = `tenants/${safeTenantId}/${safeCategory}/${uniqueFileName}`;

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        Body: file.buffer,
        ContentType: file.mimetype || 'application/octet-stream',
        ContentDisposition: 'inline',
        Metadata: {
          tenantId: safeTenantId,
          category: safeCategory,
          originalName: encodeURIComponent(file.originalname),
        },
      });

      await this.s3Client.send(command);

      // الرابط العام المباشر للملف عبر السيرفر الداخلي أو الدومين المخصص
      const publicUrl = `/api/v1/uploads/file/${s3Key}`;

      this.logger.log(
        `File successfully uploaded to R2: key="${s3Key}" size=${file.size} bytes`,
      );

      return {
        url: publicUrl,
        key: s3Key,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      };
    } catch (err: any) {
      this.logger.error(`Failed to upload file to Cloudflare R2: ${err.message}`, err.stack);
      throw new InternalServerErrorException(`فشل رفع الملف إلى التخزين السحابي: ${err.message}`);
    }
  }

  /**
   * جلب تدفق الملف مباشرة من Cloudflare R2 لعرضه للمستخدمين
   */
  async getFileStream(key: string) {
    if (!key) {
      throw new BadRequestException('مسار الملف مطلوب');
    }
    const cleanKey = key.replace(/^\/+/, '');
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: cleanKey,
    });
    return this.s3Client.send(command);
  }

  /**
   * حذف ملف من التخزين السحابي مع التحقق من ملكية السنتر للملف
   */
  async deleteFile(tenantId: string, key: string): Promise<{ success: boolean; message: string }> {
    if (!key) {
      throw new BadRequestException('مسار الملف (Key) مطلوب للحذف');
    }

    const safeTenantId = (tenantId || 'global').replace(/[^a-zA-Z0-9_-]/g, '');
    const requiredPrefix = `tenants/${safeTenantId}/`;

    // التحقق الأمني: منع أي سنتر من حذف ملفات سنتر آخر
    if (!key.startsWith(requiredPrefix)) {
      throw new BadRequestException('غير مصرح بحذف ملف لا ينتمي لهذا الحساب');
    }

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      this.logger.log(`File deleted from R2: key="${key}" by tenant="${safeTenantId}"`);

      return {
        success: true,
        message: 'تم حذف الملف من التخزين السحابي بنجاح',
      };
    } catch (err: any) {
      this.logger.error(`Failed to delete file from R2: ${err.message}`, err.stack);
      throw new InternalServerErrorException('تعذر حذف الملف من التخزين السحابي');
    }
  }

  private extractExtension(filename: string): string {
    const idx = filename.lastIndexOf('.');
    if (idx === -1) return '';
    return filename.substring(idx).toLowerCase();
  }

  private sanitizeFileName(name: string): string {
    return name
      .replace(/[\s\t\n]+/g, '-')
      .replace(/[^a-zA-Z0-9_\-\u0600-\u06FF]/g, '')
      .slice(0, 50);
  }
}
