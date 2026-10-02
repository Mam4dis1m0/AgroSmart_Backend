// src/Modules/suscripciones/suscripciones.service.ts
//
// Planes SaaS y suscripción mensual por finca (EP-12: RF-41, RF-42, CU-42).
//   Freemium → por defecto al registrar la finca.
//   Premium  → "Plan Pro": cobro mensual; al cancelar la finca vuelve a Freemium
//              conservando todos sus datos (RNF-19).

import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { PlanService } from '../../auth/plan.service';
import { AuthUser } from '../../auth/tenant-context';
import { filas } from '../../common/sql';
import { PasarelaPagoService } from './pasarela-pago.service';

const MESES_POR_CICLO = 1;

@Injectable()
export class SuscripcionesService {
  private readonly logger = new Logger(SuscripcionesService.name);

  constructor(
    private readonly ds: DataSource,
    private readonly planes: PlanService,
    private readonly pasarela: PasarelaPagoService,
  ) {}

  private exigirOnline() {
    if (!this.ds.isInitialized) {
      throw new ServiceUnavailableException('Esta operación requiere conexión a internet');
    }
  }

  listarPlanes() {
    this.exigirOnline();
    return this.ds.query(
      `SELECT idplan, codigo, nombre, descripcion, preciomensual::float8 AS preciomensual, moneda,
              maxcultivos, maxempleados, maxfincas, comisionmarketplace::float8 AS comisionmarketplace, funciones
         FROM plan WHERE activo = true ORDER BY preciomensual`,
    );
  }

  /** Estado de la suscripción de la finca activa + plan efectivo (con límites). */
  async miSuscripcion(idfinca: number) {
    this.exigirOnline();
    const [suscripcion] = await this.ds.query(
      `SELECT s.idsuscripcion, s.estado, s.fechainicio, s.fechafin, s.renovacionautomatica, p.codigo AS plan
         FROM suscripcion s JOIN plan p ON p.idplan = s.idplan
        WHERE s.idfinca = $1 AND s.estado = 'ACTIVA'`,
      [idfinca],
    );
    const planEfectivo = await this.planes.getPlan(idfinca);
    return { suscripcion: suscripcion ?? null, planEfectivo };
  }

  pagos(idfinca: number) {
    this.exigirOnline();
    return this.ds.query(
      `SELECT idpago, tipo, monto::float8 AS monto, moneda, estado, proveedor, referenciaexterna, created_at
         FROM pago WHERE idfinca = $1 ORDER BY created_at DESC LIMIT 100`,
      [idfinca],
    );
  }

  // ── CU-42 · Contratar Premium ─────────────────────────────────────────────
  async contratar(idfinca: number, user: AuthUser) {
    this.exigirOnline();

    const [premium] = await this.ds.query(
      `SELECT idplan, preciomensual::float8 AS precio, moneda FROM plan WHERE codigo = 'PREMIUM' AND activo = true`,
    );
    if (!premium) throw new NotFoundException('El plan Premium no está disponible');

    const actual = await this.planes.getPlan(idfinca);
    if (actual.codigo === 'PREMIUM') {
      throw new ConflictException('Tu finca ya tiene el plan Premium activo');
    }

    const cobro = await this.pasarela.cobrar(premium.precio, premium.moneda, `Suscripción Premium finca ${idfinca}`, {
      idfinca,
      idusuario: user.idusuario,
    });

    const [pago] = await this.ds.query(
      `INSERT INTO pago (idfinca, idusuario, tipo, monto, moneda, estado, proveedor, referenciaexterna)
       VALUES ($1, $2, 'SUSCRIPCION', $3, $4, $5, $6, $7) RETURNING idpago`,
      [
        idfinca, user.idusuario, premium.precio, premium.moneda,
        cobro.aprobado ? 'APROBADO' : 'FALLIDO', cobro.proveedor, cobro.referencia,
      ],
    );

    // Pago fallido → la finca conserva su plan actual
    if (!cobro.aprobado) {
      throw new HttpException(
        { statusCode: 402, message: cobro.motivo ?? 'El pago fue rechazado. Se mantiene tu plan actual.' },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    await this.ds.transaction(async (m) => {
      await m.query(
        `UPDATE suscripcion SET estado = 'CANCELADA', fechafin = now(), renovacionautomatica = false
          WHERE idfinca = $1 AND estado = 'ACTIVA'`,
        [idfinca],
      );
      await m.query(
        `INSERT INTO suscripcion (idfinca, idplan, estado, fechafin, idpago)
         VALUES ($1, $2, 'ACTIVA', now() + make_interval(months => $3::int), $4)`,
        [idfinca, premium.idplan, MESES_POR_CICLO, pago.idpago],
      );
      await m.query(
        `UPDATE finca SET idplan = $2, planvencimiento = now() + make_interval(months => $3::int) WHERE idfinca = $1`,
        [idfinca, premium.idplan, MESES_POR_CICLO],
      );
    });
    this.planes.invalidar(idfinca);

    return this.miSuscripcion(idfinca);
  }

  // ── Cancelar → vuelve a Freemium conservando los datos ────────────────────
  async cancelar(idfinca: number) {
    this.exigirOnline();
    const [free] = await this.ds.query(`SELECT idplan FROM plan WHERE codigo = 'FREEMIUM'`);
    if (!free) throw new NotFoundException('Falta el plan FREEMIUM');

    const actual = await this.planes.getPlan(idfinca);
    if (actual.codigo !== 'PREMIUM') {
      throw new ConflictException('Tu finca ya está en el plan Freemium');
    }
    await this.bajarAFreemium(idfinca, free.idplan, 'CANCELADA');
    return this.miSuscripcion(idfinca);
  }

  private async bajarAFreemium(idfinca: number, idPlanFree: number, estadoPrevia: 'CANCELADA' | 'VENCIDA') {
    await this.ds.transaction(async (m) => {
      await m.query(
        `UPDATE suscripcion SET estado = $2, fechafin = now(), renovacionautomatica = false
          WHERE idfinca = $1 AND estado = 'ACTIVA'`,
        [idfinca, estadoPrevia],
      );
      await m.query(`INSERT INTO suscripcion (idfinca, idplan, estado) VALUES ($1, $2, 'ACTIVA')`, [idfinca, idPlanFree]);
      await m.query(`UPDATE finca SET idplan = $2, planvencimiento = NULL WHERE idfinca = $1`, [idfinca, idPlanFree]);
    });
    this.planes.invalidar(idfinca);
  }

  // ── Renovación / vencimiento automático ───────────────────────────────────
  // Corre fuera de una petición HTTP: solo SQL, sin contexto de finca.
  @Cron(CronExpression.EVERY_HOUR)
  async procesarVencimientos() {
    if (!this.ds.isInitialized) return;
    try {
      const vencidas = filas<{ idsuscripcion: number; idfinca: number; idplan: number; renovacionautomatica: boolean; idusuario: number | null }>(
        await this.ds.query(
          `SELECT s.idsuscripcion, s.idfinca, s.idplan, s.renovacionautomatica, f.idpropietario AS idusuario
             FROM suscripcion s
             JOIN plan p  ON p.idplan = s.idplan AND p.codigo <> 'FREEMIUM'
             JOIN finca f ON f.idfinca = s.idfinca
            WHERE s.estado = 'ACTIVA' AND s.fechafin IS NOT NULL AND s.fechafin < now()`,
        ),
      );
      if (vencidas.length === 0) return;

      const [free] = await this.ds.query(`SELECT idplan FROM plan WHERE codigo = 'FREEMIUM'`);
      for (const s of vencidas) {
        try {
          if (s.renovacionautomatica && (await this.renovar(s))) continue;
          await this.bajarAFreemium(s.idfinca, free.idplan, 'VENCIDA');
          this.logger.warn(`⏬ Finca ${s.idfinca}: suscripción vencida, vuelve a Freemium`);
        } catch (err) {
          this.logger.error(`No se pudo procesar la suscripción ${s.idsuscripcion}: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      this.logger.warn(`procesarVencimientos: ${(err as Error).message}`);
    }
  }

  private async renovar(s: { idsuscripcion: number; idfinca: number; idplan: number; idusuario: number | null }): Promise<boolean> {
    const [plan] = await this.ds.query(`SELECT preciomensual::float8 AS precio, moneda FROM plan WHERE idplan = $1`, [s.idplan]);
    let cobro;
    try {
      cobro = await this.pasarela.cobrar(plan.precio, plan.moneda, `Renovación finca ${s.idfinca}`, { idfinca: s.idfinca });
    } catch {
      return false; // pasarela no disponible: se trata como pago fallido
    }
    const [pago] = await this.ds.query(
      `INSERT INTO pago (idfinca, idusuario, tipo, monto, moneda, estado, proveedor, referenciaexterna)
       VALUES ($1, $2, 'SUSCRIPCION', $3, $4, $5, $6, $7) RETURNING idpago`,
      [s.idfinca, s.idusuario, plan.precio, plan.moneda, cobro.aprobado ? 'APROBADO' : 'FALLIDO', cobro.proveedor, cobro.referencia],
    );
    if (!cobro.aprobado) return false;

    await this.ds.query(
      `UPDATE suscripcion SET fechafin = fechafin + make_interval(months => $2::int), idpago = $3 WHERE idsuscripcion = $1`,
      [s.idsuscripcion, MESES_POR_CICLO, pago.idpago],
    );
    await this.ds.query(
      `UPDATE finca SET planvencimiento = (SELECT fechafin FROM suscripcion WHERE idsuscripcion = $2) WHERE idfinca = $1`,
      [s.idfinca, s.idsuscripcion],
    );
    this.planes.invalidar(s.idfinca);
    return true;
  }
}
