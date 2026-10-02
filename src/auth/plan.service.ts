// src/auth/plan.service.ts
//
// Plan vigente de una finca (RF-41, RNF-19): límites y funciones habilitadas.
// Si la suscripción Premium venció (finca.planvencimiento) se aplica Freemium
// sin borrar datos (RNF-19).

import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface PlanInfo {
  codigo: string; // FREEMIUM | PREMIUM
  maxcultivos: number | null; // null = ilimitado
  maxempleados: number | null;
  maxfincas: number | null;
  comisionmarketplace: number; // %
  funciones: Record<string, boolean>;
}

const TTL_MS = 30_000;

/** Respaldo cuando la BD no responde y no hay caché: lo más restrictivo. */
const FREEMIUM_RESPALDO: PlanInfo = {
  codigo: 'FREEMIUM',
  maxcultivos: 3,
  maxempleados: 3,
  maxfincas: 1,
  comisionmarketplace: 5,
  funciones: {},
};

@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);
  private readonly cache = new Map<number, { plan: PlanInfo; hasta: number }>();

  constructor(private readonly ds: DataSource) {}

  async getPlan(idfinca: number): Promise<PlanInfo> {
    const hit = this.cache.get(idfinca);
    if (hit && hit.hasta > Date.now()) return hit.plan;

    if (!this.ds.isInitialized) return hit?.plan ?? FREEMIUM_RESPALDO;

    try {
      const rows = await this.ds.query(
        `SELECT p.codigo, p.maxcultivos, p.maxempleados, p.maxfincas,
                p.comisionmarketplace, p.funciones
           FROM finca f
           JOIN plan p ON p.idplan = CASE
                  WHEN f.planvencimiento IS NOT NULL AND f.planvencimiento < now()
                    THEN (SELECT idplan FROM plan WHERE codigo = 'FREEMIUM')
                  ELSE f.idplan END
          WHERE f.idfinca = $1`,
        [idfinca],
      );
      const r = rows[0];
      if (!r) throw new ForbiddenException('La finca no existe');

      const plan: PlanInfo = {
        codigo: r.codigo,
        maxcultivos: r.maxcultivos,
        maxempleados: r.maxempleados,
        maxfincas: r.maxfincas,
        comisionmarketplace: Number(r.comisionmarketplace),
        funciones: r.funciones ?? {},
      };
      this.cache.set(idfinca, { plan, hasta: Date.now() + TTL_MS });
      return plan;
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      this.logger.warn(`No se pudo leer el plan de la finca ${idfinca}: ${(err as Error).message}`);
      return hit?.plan ?? FREEMIUM_RESPALDO;
    }
  }

  async tieneFuncion(idfinca: number, funcion: string): Promise<boolean> {
    const plan = await this.getPlan(idfinca);
    return plan.funciones?.[funcion] === true;
  }

  /** Llamar tras contratar/cancelar una suscripción. */
  invalidar(idfinca: number): void {
    this.cache.delete(idfinca);
  }
}
