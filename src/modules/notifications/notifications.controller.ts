import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('api/v1/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  createNotification(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateNotificationDto,
  ) {
    return this.notificationsService.createNotification(tenantId, dto);
  }

  @Get('student')
  getStudentNotifications(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') studentId: string,
  ) {
    return this.notificationsService.getStudentNotifications(tenantId, studentId);
  }

  @Post(':id/read')
  markAsRead(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') studentId: string,
    @Param('id') id: string,
  ) {
    return this.notificationsService.markAsRead(tenantId, studentId, id);
  }

  @Post('mark-all-read')
  markAllAsRead(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') studentId: string,
  ) {
    return this.notificationsService.markAllAsRead(tenantId, studentId);
  }

  @Get('staff')
  getStaffNotifications(@CurrentTenant() tenantId: string) {
    return this.notificationsService.getStaffNotifications(tenantId);
  }
}
