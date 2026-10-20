import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

export const ROLES_KEY = 'roles';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const req = context
      .switchToHttp()
      .getRequest<{ user?: { role?: UserRole } }>();
    if (!req.user?.role || !roles.includes(req.user.role)) {
      throw new ForbiddenException('Acesso restrito a administradores');
    }
    return true;
  }
}

/** JWT + papel ADMIN. */
export function AdminOnly() {
  return applyDecorators(
    SetMetadata(ROLES_KEY, [UserRole.ADMIN]),
    UseGuards(JwtAuthGuard, RolesGuard),
  );
}

export type AuthedRequest = {
  user: { id: string; email: string; role: UserRole };
};
