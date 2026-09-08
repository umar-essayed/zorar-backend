import {
  Controller,
  Get,
  Post,
  Delete,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Query,
  Req,
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { UploadsService } from './uploads.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@Controller('api/v1/uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  /**
   * عرض وتدفق الملف مباشرة من التخزين السحابي (عام للجميع بدون توكن للمنصات والمواقع)
   */
  @Get('file/*')
  async serveFile(@Req() req: any, @Res() res: any) {
    const rawUrl = (req.originalUrl || req.url || '').split('?')[0];
    const prefix = '/api/v1/uploads/file/';
    const index = rawUrl.indexOf(prefix);
    const key = decodeURIComponent(
      index !== -1 ? rawUrl.substring(index + prefix.length) : req.params[0] || '',
    );

    if (!key) {
      return res.status(400).send('Invalid file key');
    }

    try {
      const s3Response = await this.uploadsService.getFileStream(key);
      if (s3Response.ContentType) {
        res.setHeader('Content-Type', s3Response.ContentType);
      }
      if (s3Response.ContentLength) {
        res.setHeader('Content-Length', s3Response.ContentLength);
      }
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      const stream = s3Response.Body as any;
      return stream.pipe(res);
    } catch (err: any) {
      return res.status(404).send('File not found');
    }
  }

  /**
   * رفع ملف فردي (شعار السنتر، صورة المدرس، بانر الهيرو، ملزمة PDF، أو واجب)
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB أقصى حجم
      },
    }),
  )
  async uploadSingle(
    @CurrentTenant() tenantId: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder = 'general',
  ) {
    if (!file) {
      throw new BadRequestException('يرجى اختيار ملف لرفعه');
    }
    const result = await this.uploadsService.uploadFile(tenantId, file, folder);
    return {
      success: true,
      file: result,
    };
  }

  /**
   * رفع عدة ملفات دفعة واحدة (مثل مرفقات متعددة أو ملازم)
   */
  @Post('multiple')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB لكل ملف
      },
    }),
  )
  async uploadMultiple(
    @CurrentTenant() tenantId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Query('folder') folder = 'general',
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('يرجى اختيار ملف واحد على الأقل للرفع');
    }

    const uploadPromises = files.map((f) => this.uploadsService.uploadFile(tenantId, f, folder));
    const results = await Promise.all(uploadPromises);

    return {
      success: true,
      count: results.length,
      files: results,
    };
  }

  /**
   * حذف ملف من التخزين السحابي
   */
  @Delete()
  @UseGuards(JwtAuthGuard)
  async deleteFile(@CurrentTenant() tenantId: string, @Query('key') key: string) {
    return this.uploadsService.deleteFile(tenantId, key);
  }
}
