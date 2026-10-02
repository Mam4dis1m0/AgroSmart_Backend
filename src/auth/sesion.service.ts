// src/auth/sesion.service.ts
//
// RNF-11: un usuario desactivado (o removido de la finca) no debe seguir operando
// con un token todavía vigente. Se consulta la BD con un caché corto (60 s) para no
// golpearla en cada petición. Si la BD no responde (modo offline) se confía en el token.

import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

const TTL_MS = 60_000;

@Injectable()
export class SesionService {
  private readonly logger = new Logger(SesionService.name);
  private readonly cache = new Map<string, { ok: boolean; hasta: number }>();

  constructor(private readonly ds: DataSource) {}

  /** idfinca = null para compradores o cuando todavía no hay finca activa. */
  async estaActiva(idusuario: number, idfinca: number | null): Promise<boolean> {
    const key = `${idusuario}:${idfinca ?? 0}`;
    const hit = this.cache.get(key);
    if (hit && hit.hasta > Date.now()) return hit.ok;

    if (!this.ds.isInitialized) return true; // offline

    try {
      const rows = await this.ds.query(
        `SELECT u.activo  AS uactivo,
                fu.activo AS fuactivo,
                f.activo  AS factivo
           FROM usuario u
           LEFT JOIN finca_usuario fu ON fu.idusuario = u.idusuario AND fu.idfinca = $2
           LEFT JOIN finca f          ON f.idfinca = $2
          WHERE u.idusuario = $1`,
        [idusuario, idfinca],
      );
      const r = rows[0];
      const ok =
        !!r &&
        r.uactivo !== false &&
        (idfinca === null || (r.fuactivo === true && r.factivo === true));
      this.cache.set(key, { ok, hasta: Date.now() + TTL_MS });
      return ok;
    } catch (err) {
      // Sin red o esquema sin migrar: no tumbar la API, pero dejar rastro
      this.logger.warn(`No se pudo verificar la sesión (${(err as Error).message}); se confía en el token`);
      return true;
    }
  }

  /** Llamar al desactivar un usuario o quitarlo de una finca. */
  invalidar(idusuario: number): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${idusuario}:`)) this.cache.delete(key);
    }
  }
}
