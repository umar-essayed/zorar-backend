import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { SendWhatsAppMessageDto } from './dto/queue-message.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@Controller('api/v1/whatsapp')
@UseGuards(JwtAuthGuard)
export class WhatsAppController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  @Post('send')
  queueMessage(@CurrentTenant() tenantId: string, @Body() dto: SendWhatsAppMessageDto) {
    return this.whatsappService.queueMessage(tenantId, dto);
  }

  @Get('logs')
  getLogs(@CurrentTenant() tenantId: string, @Query('limit') limit?: number) {
    return this.whatsappService.getMessageHistory(tenantId, limit ? Number(limit) : 50);
  }
}
