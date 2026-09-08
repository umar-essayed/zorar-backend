import { IsString, IsOptional, IsObject } from 'class-validator';

export class UpdateBrandingDto {
  @IsObject()
  brandingConfig: {
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    themeMode?: 'light' | 'dark' | 'system';
    heroBannerUrl?: string;
    faviconUrl?: string;
    announcementText?: string;
  };
}

export class RechargeQuotaDto {
  @IsString()
  tenantId: string;

  amount: number; // عدد النقاط
  reason?: string;
}
