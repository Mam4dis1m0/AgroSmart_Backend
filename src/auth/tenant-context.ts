// src/auth/tenant-context.ts
//
// Contexto de la petición actual (usuario autenticado + finca activa).
// Usa AsyncLocalStorage: el middleware crea un "almacén" por petición y el
// AuthGuard lo llena con el usuario del JWT. Así cualquier servicio (incluida
// BaseOfflineService) sabe en qué finca está operando sin pasar parámetros.
//
// RNF-16: si no hay finca en el contexto, requireFinca() lanza error → nunca se
// consulta "sin filtro" por accidente.

import { AsyncLocalStorage } from 'async_hooks';
import {
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';

export type Rol = 'admin' | 'empleado' | 'comprador';

export interface AuthUser {
  idusuario: number;
  email: string;
  rol: Rol;
  /** Finca activa (tenant). null para compradores o admins que aún no eligen finca. */
  idfinca: number | null;
}

interface Store {
  user?: AuthUser;
}

const als = new AsyncLocalStorage<Store>();

export const TenantContext = {
  /** Lo invoca el middleware: ejecuta el resto de la petición dentro de un contexto propio. */
  run<T>(fn: () => T): T {
    return als.run({}, fn);
  },

  setUser(user: AuthUser): void {
    const store = als.getStore();
    if (!store) {
      throw new InternalServerErrorException(
        'TenantContext no inicializado: falta app.use(tenantMiddleware) en main.ts',
      );
    }
    store.user = user;
  },

  user(): AuthUser | undefined {
    return als.getStore()?.user;
  },

  requireUser(): AuthUser {
    const u = als.getStore()?.user;
    if (!u) throw new UnauthorizedException('Sesión requerida');
    return u;
  },

  idfinca(): number | null {
    return als.getStore()?.user?.idfinca ?? null;
  },

  /** Finca activa obligatoria. Lanza 403 si el usuario aún no seleccionó una. */
  requireFinca(): number {
    const id = als.getStore()?.user?.idfinca;
    if (id === undefined || id === null) {
      throw new ForbiddenException('Debes seleccionar una finca activa');
    }
    return id;
  },
};

/** Middleware Express: crea el contexto de la petición. Registrar en main.ts. */
export function tenantMiddleware(_req: any, _res: any, next: () => void) {
  TenantContext.run(() => next());
}
