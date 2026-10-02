// src/auth/plan.guard.ts
//
// Guard GLOBAL que corre después de AuthGuard. Si el handler declara
// @RequiereFuncion('nomina') (u otra), valida que el plan de la finca activa la incluya.
// Se consulta la BD (con caché corto), no el token, para que un upgrade aplique de inmediato.

import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FUNCION_KEY } from './auth.decorators';
import { PlanService } from './plan.service';
import { TenantContext } from './tenant-context';

@Injectable()
export class PlanGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly planes: PlanService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const funcion = this.reflector.getAllAndOverride<string>(FUNCION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!funcion) return true;

    const idfinca = TenantContext.requireFinca();
    if (!(await this.planes.tieneFuncion(idfinca, funcion))) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PLAN_PREMIUM_REQUERIDO',
        message: 'Esta función requiere el plan Premium. Actualiza la suscripción de tu finca.',
        funcion,
      });
    }
    return true;
  }
}
