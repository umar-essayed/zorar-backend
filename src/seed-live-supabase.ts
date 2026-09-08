import { PrismaClient, TenantType, PlanType, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 جاري زرع بيانات أولية تجريبية على قاعدة بيانات Supabase الحية...');

  // 1. إنشاء السنتر التجريبي
  const tenant = await prisma.tenant.upsert({
    where: { subdomain: 'al-awaer' },
    update: {},
    create: {
      name: 'مركز الأوائل التعليمي',
      type: TenantType.CENTER,
      plan: PlanType.PRO,
      subdomain: 'al-awaer',
      quotaBalance: 500,
      brandingConfig: {
        primaryColor: '#2563eb',
        secondaryColor: '#1e40af',
        accentColor: '#f59e0b',
        themeMode: 'light',
        logoUrl: 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=200',
      },
      settings: {
        defaultCurrency: 'EGP',
        allowOfflineMode: true,
      },
    },
  });

  console.log(`✅ تم إنشاء/التحقق من السنتر: ${tenant.name} (${tenant.id})`);

  // 2. إنشاء المشرف العام ومدير السنتر
  const adminPassword = await bcrypt.hash('Admin@123456', 10);

  const admin = await prisma.user.upsert({
    where: {
      tenantId_phone: {
        tenantId: tenant.id,
        phone: '01000000001',
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'أحمد محمود (مدير السنتر)',
      phone: '01000000001',
      passwordHash: adminPassword,
      role: UserRole.TENANT_ADMIN,
    },
  });

  console.log(`✅ تم إنشاء حساب مدير السنتر: ${admin.name} (رقم الهاتف: ${admin.phone} | كلمة المرور: Admin@123456)`);

  // 3. إنشاء سنة دراسية ومادة
  const year = await prisma.academicYear.create({
    data: {
      tenantId: tenant.id,
      name: 'الصف الثالث الثانوي (علمي وأدبي)',
      orderIndex: 1,
    },
  });

  const subject = await prisma.subject.create({
    data: {
      tenantId: tenant.id,
      name: 'الفيزياء للثانوية العامة',
      code: 'PHY-3SEC',
    },
  });

  console.log(`✅ تم إنشاء المرحلة الدراسية: ${year.name} والمادة: ${subject.name}`);
  console.log('🎉 اكتملت تهيئة قاعدة بيانات Supabase الحية بنجاح!');
}

seed()
  .catch((e) => {
    console.error('❌ خطأ في الزرع التجريبي:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
