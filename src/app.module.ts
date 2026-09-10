import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './common/prisma/prisma.module';
import { TenantMiddleware } from './common/middleware/tenant.middleware';

import { TenantModule } from './modules/tenant/tenant.module';
import { AuthModule } from './modules/auth/auth.module';
import { AcademicModule } from './modules/academic/academic.module';
import { TeachersModule } from './modules/teachers/teachers.module';
import { StudentsModule } from './modules/students/students.module';
import { BooksModule } from './modules/books/books.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { FinanceModule } from './modules/finance/finance.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { CoursesModule } from './modules/courses/courses.module';
import { ExamsModule } from './modules/exams/exams.module';
import { StorefrontModule } from './modules/storefront/storefront.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { AdmissionModule } from './modules/admission/admission.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 120, // default global limit per IP
      },
    ]),
    PrismaModule,
    TenantModule,
    AuthModule,
    AcademicModule,
    TeachersModule,
    StudentsModule,
    BooksModule,
    AttendanceModule,
    FinanceModule,
    ExpensesModule,
    CoursesModule,
    ExamsModule,
    StorefrontModule,
    WhatsAppModule,
    AdmissionModule,
    UploadsModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
