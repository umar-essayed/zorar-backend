import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class SendWhatsAppMessageDto {
  @IsString()
  @IsNotEmpty({ message: 'رقم المستلم الدولي مطلوب' })
  recipient: string; // مثل: +201012345678

  @IsString()
  @IsNotEmpty({ message: 'مفتاح القالب مطلوب' })
  templateKey: string;

  @IsString()
  @IsNotEmpty({ message: 'نص الرسالة مطلوب' })
  content: string;

  @IsString()
  @IsOptional()
  scheduledFor?: string;
}
