import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUserPayload {
  userId: string;
  email?: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserPayload | undefined, ctx: ExecutionContext): CurrentUserPayload | string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as CurrentUserPayload;

    if (data) {
      return user?.[data];
    }

    return user;
  },
);
