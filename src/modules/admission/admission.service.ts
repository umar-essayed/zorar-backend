import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StudentsService } from '../students/students.service';
import { CreateAdmissionFormDto, SubmitAdmissionDto } from './dto/submit-admission.dto';

@Injectable()
export class AdmissionService {
  constructor(
    private prisma: PrismaService,
    private studentsService: StudentsService,
  ) {}

  async createForm(tenantId: string, dto: CreateAdmissionFormDto) {
    return this.prisma.admissionForm.create({
      data: {
        tenantId,
        title: dto.title,
        slug: dto.slug.toLowerCase(),
        fieldsConfig: dto.fieldsConfig,
      },
    });
  }

  async getOrCreateDefaultForm(tenantId: string) {
    let form = await this.prisma.admissionForm.findFirst({
      where: { tenantId },
      include: {
        _count: {
          select: { submissions: true },
        },
      },
    });

    if (!form) {
      form = await this.prisma.admissionForm.create({
        data: {
          tenantId,
          title: 'استمارة التقديم والحجز الإلكتروني الموحدة',
          slug: 'main',
          isOpen: true,
          fieldsConfig: {
            requireNationalId: false,
            requireSchoolName: true,
            requirePreviousGrade: true,
            allowGroupSelection: true,
          },
        },
        include: {
          _count: {
            select: { submissions: true },
          },
        },
      });
    }

    return form;
  }

  async toggleForm(tenantId: string, formId: string) {
    const form = await this.prisma.admissionForm.findUnique({
      where: { id: formId },
    });
    if (!form || form.tenantId !== tenantId) {
      throw new NotFoundException('الاستمارة غير موجودة');
    }

    return this.prisma.admissionForm.update({
      where: { id: formId },
      data: { isOpen: !form.isOpen },
    });
  }

  async getPublicFormBySlug(slugOrSubdomain: string) {
    // 1. البحث بالنطاق الفرعي أو النطاق المخصص للمؤسسة
    let tenant = await this.prisma.tenant.findUnique({
      where: { subdomain: slugOrSubdomain.toLowerCase() },
      include: {
        academicYears: {
          include: {
            groups: {
              include: {
                subject: true,
                teacher: true,
              },
            },
          },
        },
        subjects: true,
        teachers: {
          where: { isActive: true },
          select: { id: true, name: true, subject: true },
        },
      },
    });

    if (!tenant) {
      tenant = await this.prisma.tenant.findUnique({
        where: { customDomain: slugOrSubdomain.toLowerCase() },
        include: {
          academicYears: {
            include: {
              groups: {
                include: {
                  subject: true,
                  teacher: true,
                },
              },
            },
          },
          subjects: true,
          teachers: {
            where: { isActive: true },
            select: { id: true, name: true, subject: true },
          },
        },
      });
    }

    if (tenant) {
      const form = await this.getOrCreateDefaultForm(tenant.id);
      return {
        tenantName: tenant.name,
        subdomain: tenant.subdomain,
        brandingConfig: tenant.brandingConfig,
        academicYears: tenant.academicYears,
        subjects: tenant.subjects,
        teachers: tenant.teachers,
        form,
      };
    }

    // 2. البحث بالمسار المباشر للاستمارة (Slug)
    const form = await this.prisma.admissionForm.findFirst({
      where: { slug: slugOrSubdomain.toLowerCase() },
      include: {
        tenant: {
          include: {
            academicYears: {
              include: {
                groups: {
                  include: {
                    subject: true,
                    teacher: true,
                  },
                },
              },
            },
            subjects: true,
            teachers: {
              where: { isActive: true },
              select: { id: true, name: true, subject: true },
            },
          },
        },
      },
    });

    if (!form) {
      const fallbackTenant = await this.prisma.tenant.findFirst({
        where: { isActive: true },
        include: {
          academicYears: {
            include: {
              groups: {
                include: {
                  subject: true,
                  teacher: true,
                },
              },
            },
          },
          subjects: true,
          teachers: {
            where: { isActive: true },
            select: { id: true, name: true, subject: true },
          },
        },
      });

      if (fallbackTenant) {
        const defaultForm = await this.getOrCreateDefaultForm(fallbackTenant.id);
        return {
          tenantName: fallbackTenant.name,
          subdomain: fallbackTenant.subdomain,
          brandingConfig: fallbackTenant.brandingConfig,
          academicYears: fallbackTenant.academicYears,
          subjects: fallbackTenant.subjects,
          teachers: fallbackTenant.teachers,
          form: defaultForm,
        };
      }

      throw new NotFoundException('استمارة التقديم غير موجودة أو انتهت صلاحيتها');
    }

    return {
      tenantName: form.tenant.name,
      subdomain: form.tenant.subdomain,
      brandingConfig: form.tenant.brandingConfig,
      academicYears: form.tenant.academicYears,
      subjects: form.tenant.subjects,
      teachers: form.tenant.teachers,
      form,
    };
  }

  async getPublicForm(subdomain: string, slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { subdomain: subdomain.toLowerCase() },
      include: {
        academicYears: { include: { groups: true } },
        subjects: true,
        teachers: { where: { isActive: true }, select: { id: true, name: true, subject: true } },
      },
    });
    if (!tenant) throw new NotFoundException('المؤسسة غير موجودة');

    const form = await this.prisma.admissionForm.findUnique({
      where: {
        tenantId_slug: {
          tenantId: tenant.id,
          slug: slug.toLowerCase(),
        },
      },
    });

    if (!form || !form.isOpen) {
      throw new NotFoundException('استمارة التقديم غير متاحة أو مغلقة حالياً');
    }

    return {
      tenantName: tenant.name,
      subdomain: tenant.subdomain,
      brandingConfig: tenant.brandingConfig,
      academicYears: tenant.academicYears,
      subjects: tenant.subjects,
      teachers: tenant.teachers,
      form,
    };
  }

  async submitApplication(formId: string, dto: SubmitAdmissionDto) {
    const form = await this.prisma.admissionForm.findUnique({
      where: { id: formId },
      include: { tenant: true },
    });
    if (!form || !form.isOpen) {
      throw new BadRequestException('التقديم مغلق حالياً');
    }

    const refCode = 'ADM-' + Math.floor(100000 + Math.random() * 900000);
    const enrichedFormData = {
      ...(typeof dto.formData === 'object' && dto.formData !== null ? dto.formData : {}),
      notes: dto.notes || dto.formData?.notes || null,
      refCode,
    };

    const submission = await this.prisma.admissionSubmission.create({
      data: {
        formId,
        studentName: dto.studentName,
        phone: dto.phone,
        guardianPhone: dto.guardianPhone,
        formData: enrichedFormData,
        status: 'PENDING',
      },
    });

    // إرسال إشعار فوري لولي الأمر بتأكيد استلام الطلب
    await this.prisma.whatsAppMessage.create({
      data: {
        tenantId: form.tenantId,
        recipient: dto.guardianPhone,
        templateKey: 'ADMISSION_RECEIVED',
        content: `أهلاً بك! تم استلام طلب حجز الطالب (${dto.studentName}) في ${form.tenant.name} بنجاح. كود مرجع الحجز هو [${refCode}]. سيتم التواصل معكم فور تأكيد موعد أول حصة واعتماد الحجز.`,
      },
    }).catch(() => null);

    return {
      success: true,
      message: 'تم إرسال طلب التقديم بنجاح',
      submissionId: submission.id,
      refCode,
    };
  }

  async approveSubmission(tenantId: string, submissionId: string, academicYearId: string, groupIds?: string[]) {
    const submission = await this.prisma.admissionSubmission.findUnique({
      where: { id: submissionId },
      include: { form: true },
    });

    if (!submission || submission.form.tenantId !== tenantId) {
      throw new NotFoundException('طلب التقديم غير موجود');
    }

    // إنشاء حساب الطالب الفعلي وتوليد كارت الـ QR وخصم الكوتا
    const student = await this.studentsService.createStudent(tenantId, {
      name: submission.studentName,
      phone: submission.phone,
      guardianPhone: submission.guardianPhone,
      academicYearId,
      groupIds,
    });

    await this.prisma.admissionSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'APPROVED',
        approvedStudentId: student.studentCode,
      },
    });

    // إرسال رسالة القبول وكود الطالب لولي الأمر بالواتساب
    await this.prisma.whatsAppMessage.create({
      data: {
        tenantId,
        recipient: submission.guardianPhone,
        templateKey: 'ADMISSION_APPROVED',
        content: `تهانينا! تم اعتماد حجز الطالب (${student.name}). كود الطالب المعتمد هو [${student.studentCode}]. يمكنك استخدامه لتسجيل الدخول ومتابعة الحصص.`,
      },
    }).catch(() => null);

    return {
      success: true,
      student,
    };
  }

  async rejectSubmission(tenantId: string, submissionId: string, reason?: string) {
    const submission = await this.prisma.admissionSubmission.findUnique({
      where: { id: submissionId },
      include: { form: { include: { tenant: true } } },
    });

    if (!submission || submission.form.tenantId !== tenantId) {
      throw new NotFoundException('طلب التقديم غير موجود');
    }

    const currentData =
      typeof submission.formData === 'object' && submission.formData !== null
        ? submission.formData
        : {};

    const updated = await this.prisma.admissionSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'REJECTED',
        formData: {
          ...currentData,
          rejectionReason: reason || 'نعتذر لعدم توفر مقاعد حالياً',
        },
      },
    });

    // إرسال رسالة الاعتذار
    await this.prisma.whatsAppMessage.create({
      data: {
        tenantId,
        recipient: submission.guardianPhone,
        templateKey: 'ADMISSION_REJECTED',
        content: `نعتذر لك يا ولي أمر الطالب (${submission.studentName}). تعذر قبول طلب الالتحاق في ${submission.form.tenant.name} (${reason || 'نعتذر لاكتمال الأعداد في المجموعات'}). نتمنى للطالب دوام التوفيق.`,
      },
    }).catch(() => null);

    return {
      success: true,
      submission: updated,
    };
  }

  async deleteSubmission(tenantId: string, submissionId: string) {
    const submission = await this.prisma.admissionSubmission.findUnique({
      where: { id: submissionId },
      include: { form: true },
    });

    if (!submission || submission.form.tenantId !== tenantId) {
      throw new NotFoundException('طلب التقديم غير موجود');
    }

    await this.prisma.admissionSubmission.delete({
      where: { id: submissionId },
    });

    return { success: true };
  }

  async getSubmissions(tenantId: string, formId?: string) {
    return this.prisma.admissionSubmission.findMany({
      where: {
        form: {
          tenantId,
          ...(formId ? { id: formId } : {}),
        },
      },
      include: { form: true },
      orderBy: { submittedAt: 'desc' },
    });
  }
}
