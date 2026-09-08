# 🚀 Zorar Code - Multi-Tenant Enterprise Backend (Vercel Serverless & Standalone)

الباك إند المتكامل والمتقدم لمنظومة **زُرار كود (Zorar Code)** لإدارة السناتر التعليمية والمراكز والعيادات، مبني بأحدث تقنيات **NestJS 10** و **Prisma ORM**، ومُهيأ بالكامل للتشغيل كـ **Vercel Serverless Functions** أو كـ **Standalone Node.js Server**.

---

## ✨ المميزات المعمارية والتقنية

- ⚡ **Vercel Serverless Native (`api/index.ts`):** تشغيل فوري وبداية دافئة (Warm container caching) بأداء فائق وتوسّع لا نهائي دون تكاليف خوادم غير مستغلة.
- 🗄️ **Multi-Tenant Database Architecture:** عزل تام لبيانات السناتر والمدرسين عبر Prisma Middleware و Tenant Isolation.
- 🔐 **JWT & Role-Based Access Control:** صلاحيات دقيقة ومحكمة (SuperAdmin, Center Owner, Assistant, Teacher, Student).
- 📚 **Interactive Swagger Documentation:** توثيق تفاعلي فوري لجميع نقاط الاتصال على المسار `/docs`.
- 🩺 **Serverless Healthcheck Endpoint:** نقطة فحص الجاهزية `/health` لمراقبة استقرار الخادم السيرفرليس.
- 💬 **WhatsApp Gateway Integration:** إرسال إيصالات الدفع، تنبيهات الغياب، وكروت الـ QR.

---

## 🛠️ متطلبات التشغيل والبيئة

قم بنسخ ملف المتغيرات وإعداد بيانات الاتصال:

```bash
cp .env.example .env
```

المتغيرات الأساسية المطلوبة في لوحة تحكم Vercel (Environment Variables):
- `DATABASE_URL`: رابط الاتصال عبر Supabase Pooler (Port 6543 مع `?pgbouncer=true`).
- `DIRECT_URL`: رابط الاتصال المباشر لـ Prisma (Port 5432).
- `JWT_SECRET`: مفتاح تشفير توكنات الجلسة.
- `PLATFORM_BASE_DOMAIN`: نطاق المنصة الأساسي (مثال: `eduzorar.com`).

---

## 🚀 التثبيت والتشغيل المحلي

### 1. تثبيت الحزم وتوليد كود Prisma
```bash
npm install
npm run prisma:generate
```

### 2. اختبار السيرفرليس محلياً (Serverless Handler Test)
```bash
npx ts-node test-serverless.ts
```

### 3. تشغيل الخادم المستقل (Development Mode)
```bash
npm run start:dev
```
سيعمل الخادم على: `http://localhost:4000`  
وتوثيق Swagger على: `http://localhost:4000/docs`

---

## ☁️ النشر على Vercel (Serverless Deployment)

التطبيق مجهز بملف `vercel.json` ونقطة الدخول `api/index.ts`:

1. اربط المستودع بحسابك على **Vercel**.
2. أضف متغيرات البيئة من ملف `.env.example`.
3. اضغط **Deploy**. سيقوم Vercel تلقائياً بتشغيل:
   ```bash
   npm run vercel-build
   ```
   وتوجيه جميع الطلبات عبر السيرفرليس فانكشن `/api`.

---

## 📄 الترخيص
حقوق التطوير والملكية محفوظة لفريق **زرار كود (Zorar Code)** © 2026.
