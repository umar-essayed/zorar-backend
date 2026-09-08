import { IsString, IsOptional, IsObject, IsArray } from 'class-validator';

export class UpdateStorefrontDto {
  @IsString()
  @IsOptional()
  heroTitle?: string;

  @IsString()
  @IsOptional()
  heroSubtitle?: string;

  @IsString()
  @IsOptional()
  heroBannerUrl?: string;

  @IsString()
  @IsOptional()
  heroVideoUrl?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsString()
  @IsOptional()
  faviconUrl?: string;

  @IsString()
  @IsOptional()
  primaryColor?: string;

  @IsString()
  @IsOptional()
  secondaryColor?: string;

  @IsString()
  @IsOptional()
  accentColor?: string;

  @IsString()
  @IsOptional()
  fontFamily?: string;

  @IsString()
  @IsOptional()
  themeMode?: string;

  @IsArray()
  @IsOptional()
  testimonials?: { studentName: string; score: string; quote: string; photoUrl?: string }[];

  @IsArray()
  @IsOptional()
  faqItems?: { question: string; answer: string }[];

  @IsObject()
  @IsOptional()
  socialLinks?: { facebook?: string; youtube?: string; telegram?: string; whatsapp?: string };

  @IsString()
  @IsOptional()
  footerText?: string;

  @IsString()
  @IsOptional()
  seoTitle?: string;

  @IsString()
  @IsOptional()
  seoDescription?: string;

  @IsString()
  @IsOptional()
  seoKeywords?: string;

  @IsString()
  @IsOptional()
  ogImageUrl?: string;
}
