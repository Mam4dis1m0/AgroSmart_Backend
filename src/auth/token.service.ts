// src/auth/token.service.ts
//
// JWT HS256 firmado con el módulo crypto de Node (sin dependencias nuevas).
// Payload: { sub, email, rol, idfinca, iat, exp }
//
// Variables de entorno:
//   JWT_SECRET         (obligatoria, mínimo 32 caracteres)
//   JWT_EXPIRES_HOURS  (opcional, por defecto 24)

import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { AuthUser, Rol } from './tenant-context';

export interface JwtPayload {
  sub: number;
  email: string;
  rol: Rol;
  idfinca: number | null;
  iat: number;
  exp: number;
}

const ROLES_VALIDOS: Rol[] = ['admin', 'empleado', 'comprador'];

@Injectable()
export class TokenService implements OnModuleInit {
  private readonly logger = new Logger(TokenService.name);

  onModuleInit() {
    // Falla al arrancar (y no en el primer login) si el secreto falta o es débil
    this.secret();
  }

  private secret(): string {
    const s = process.env.JWT_SECRET;
    if (!s || s.length < 32) {
      throw new Error(
        'JWT_SECRET no configurado o demasiado corto (mínimo 32 caracteres). Agrégalo al archivo .env',
      );
    }
    return s;
  }

  private b64(input: Buffer | string): string {
    return Buffer.from(input).toString('base64url');
  }

  private firma(data: string): Buffer {
    return createHmac('sha256', this.secret()).update(data).digest();
  }

  sign(user: AuthUser): string {
    const horas = Number(process.env.JWT_EXPIRES_HOURS) > 0 ? Number(process.env.JWT_EXPIRES_HOURS) : 24;
    const ahora = Math.floor(Date.now() / 1000);
    const payload: JwtPayload = {
      sub: user.idusuario,
      email: user.email,
      rol: user.rol,
      idfinca: user.idfinca ?? null,
      iat: ahora,
      exp: ahora + Math.round(horas * 3600),
    };
    const cuerpo = `${this.b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${this.b64(JSON.stringify(payload))}`;
    return `${cuerpo}.${this.b64(this.firma(cuerpo))}`;
  }

  verify(token: string): AuthUser {
    const partes = token.split('.');
    if (partes.length !== 3) throw new UnauthorizedException('Token inválido');
    const [h, p, f] = partes;

    let header: any;
    let payload: JwtPayload;
    try {
      header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
      payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    } catch {
      throw new UnauthorizedException('Token inválido');
    }

    // Solo HS256: evita el ataque clásico de alg:none / cambio de algoritmo
    if (header?.alg !== 'HS256') throw new UnauthorizedException('Token inválido');

    const esperada = this.firma(`${h}.${p}`);
    const recibida = Buffer.from(f, 'base64url');
    if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) {
      throw new UnauthorizedException('Token inválido');
    }

    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('La sesión expiró. Inicia sesión de nuevo.');
    }
    if (!Number.isInteger(payload.sub) || !ROLES_VALIDOS.includes(payload.rol)) {
      throw new UnauthorizedException('Token inválido');
    }

    return {
      idusuario: payload.sub,
      email: payload.email,
      rol: payload.rol,
      idfinca: payload.idfinca ?? null,
    };
  }
}
