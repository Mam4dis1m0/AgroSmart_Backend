// src/auth/auth.decorators.ts
import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AuthUser, Rol } from './tenant-context';

export const IS_PUBLIC_KEY = 'agro:isPublic';
export const ROLES_KEY = 'agro:roles';
export const SIN_FINCA_KEY = 'agro:sinFinca';
export const FUNCION_KEY = 'agro:funcionPlan';

/** Ruta abierta (login, registro, recuperar contraseña). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Roles permitidos. Si una ruta no lo declara, por defecto es ['admin', 'empleado'],
 * es decir: el comprador del Marketplace NO entra a rutas de gestión (RNF-20).
 */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_KEY, roles);

/** La ruta funciona sin finca activa (seleccionar finca, catálogo, perfil...). */
export const SinFinca = () => SetMetadata(SIN_FINCA_KEY, true);

/**
 * Exige que el plan de la finca incluya la función (ver tabla plan.funciones):
 * nomina, exportar_excel, talent_center, chat_ia, marketplace_premium, ...
 */
export const RequiereFuncion = (funcion: string) => SetMetadata(FUNCION_KEY, funcion);

/** Inyecta el usuario autenticado en el handler: handler(@CurrentUser() user: AuthUser) */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
