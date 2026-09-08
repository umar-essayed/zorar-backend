import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentTenant = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    // إما من التوكن أو من معالجة الدومين بالـ Middleware
    return request.user?.tenantId || request.tenant?.id || request.headers['x-tenant-id'];
  },
);
