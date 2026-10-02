// src/auth/auth.guard.ts
//
// Guard GLOBAL (APP_GUARD). Toda ruta exige JWT salvo las marcadas con @Public().
//
//   1. Verifica el token y que el usuario/finca sigan activos (RNF-01, RNF-11).
//   2. Publica el usuario en TenantContext → los servicios filtran por finca (RNF-16).
//   3. Aplica @Roles (por defecto admin|empleado, el comprador queda fuera: RNF-20).
//   4. Exige finca activa salvo en rutas @SinFinca().
//   5. Registra en auditoría los intentos denegados (RNF-20, CU-04).

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Auditoria } from '../Entidades/entities/Auditoria';
import { IS_PUBLIC_KEY, ROLES_KEY, SIN_FINCA_KEY } from './auth.decorators';
import { SesionService } from './sesion.service';
import { AuthUser, Rol, TenantContext } from './tenant-context';
import { TokenService } from './token.service';

const ROLES_POR_DEFECTO: Rol[] = ['admin', 'empleado'];

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly sesiones: SesionService,
    @InjectRepository(Auditoria) private readonly auditoriaRepo: Repository<Auditoria>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const objetivos = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, objetivos)) return true;

    const req = context.switchToHttp().getRequest();
    const [esquema, token] = String(req.headers?.authorization ?? '').split(' ');
    if (esquema !== 'Bearer' || !token) {
      throw new UnauthorizedException('Falta el token de autenticación');
    }

    const user = this.tokens.verify(token);

    const activa = await this.sesiones.estaActiva(
      user.idusuario,
      user.rol === 'comprador' ? null : user.idfinca,
    );
    if (!activa) {
      throw new UnauthorizedException('Cuenta inactiva o sin acceso a esta finca');
    }

    req.user = user;
    TenantContext.setUser(user);

    const roles = this.reflector.getAllAndOverride<Rol[]>(ROLES_KEY, objetivos) ?? ROLES_POR_DEFECTO;
    if (!roles.includes(user.rol)) {
      this.registrarDenegado(req, user);
      throw new ForbiddenException('Acceso no autorizado');
    }

    const sinFinca = this.reflector.getAllAndOverride<boolean>(SIN_FINCA_KEY, objetivos);
    if (!sinFinca && user.rol !== 'comprador' && user.idfinca === null) {
      throw new ForbiddenException('Debes seleccionar una finca activa');
    }

    return true;
  }

  /** Fire-and-forget: la auditoría nunca debe bloquear ni romper la respuesta. */
  private registrarDenegado(req: any, user: AuthUser): void {
    const descripcion = `Acceso denegado: ${req.method} ${req.originalUrl ?? req.url} (rol=${user.rol})`;
    this.logger.warn(`${descripcion} usuario=${user.idusuario}`);
    Promise.resolve()
      .then(() =>
        this.auditoriaRepo.save(
          this.auditoriaRepo.create({
            tablaNombre: 'acceso',
            operacion: 'DENEGADO',
            descripcion,
            idusuario: user.idusuario,
            idfinca: user.idfinca ?? null,
          }),
        ),
      )
      .catch((err) => this.logger.warn(`No se pudo auditar el acceso denegado: ${err?.message ?? err}`));
  }
}
