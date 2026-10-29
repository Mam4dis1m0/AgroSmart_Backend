// src/Modules/nomina/nomina.service.ts
//
// Nómina y control de pagos (EP-11, CU-38, Premium).
//
// Cada empleado tiene un pago acordado por DÍA, SEMANA o MES. La nómina del período paga eso, no horas:
//     dia    → días trabajados × valor del día. Un día cuenta si el empleado inició o completó alguna tarea
//              ese día (se calcula solo; el administrador puede corregirlo mientras el borrador no se confirme).
//     semana → valor de la semana × (días del período ÷ 7)
//     mes    → valor del mes × meses del período
// Así lo que cada empleado registre en sus tareas no cambia lo que se le paga.
// Las deducciones se ajustan a mano mientras la nómina está en BORRADOR.
// Flujo: BORRADOR → (revisa/ajusta) → CONFIRMADA → PAGADA.
//
// ⚠️ No incluye empleado_cosecha (pago por cosecha): confirma con negocio si debe sumarse.

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { filas } from '../../common/sql';
import { brutoDePago, unidadesDePago } from './pago-periodo';

const r2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class NominaService {
  constructor(private readonly ds: DataSource) {}

  private exigirOnline() {
    if (!this.ds.isInitialized) {
      throw new ServiceUnavailableException('La nómina requiere conexión a internet');
    }
  }

  /**
   * Empleados activos con pago configurado y los días del período en que iniciaron o completaron una tarea.
   * Las horas se ajustan a Colombia (UTC−5) para que un trabajo de la tarde no cuente como el día siguiente.
   */
  private lineasDelPeriodo(idfinca: number, inicio: string, fin: string) {
    return this.ds.query(
      `WITH dias AS (
         SELECT a.idempleado, ((x.t - interval '5 hours')::date) AS dia
           FROM asignacion_tarea a
          CROSS JOIN LATERAL (VALUES (a.fechainicio), (a.fechafin)) AS x(t)
          WHERE a.idfinca = $1 AND x.t IS NOT NULL
            AND ((x.t - interval '5 hours')::date) BETWEEN $2::date AND $3::date
       )
       SELECT e.idusuario AS idempleado, e.tipopago, e.valorpago::float8 AS valorpago,
              (SELECT count(DISTINCT d.dia) FROM dias d WHERE d.idempleado = e.idusuario)::int AS diastrabajados
         FROM empleado e
         JOIN finca_usuario fu ON fu.idusuario = e.idusuario AND fu.idfinca = $1 AND fu.rol = 'empleado' AND fu.activo = true
        WHERE e.valorpago > 0`,
      [idfinca, inicio, fin],
    );
  }

  // ── CU-38 · Calcular nómina del período (queda en BORRADOR para revisión) ──
  async crear(inicio: string, fin: string, idadmin: number, idfinca: number) {
    this.exigirOnline();
    if (fin < inicio) throw new BadRequestException('fechafin no puede ser anterior a fechainicio');

    const [choque] = await this.ds.query(
      `SELECT idnomina FROM nomina
        WHERE idfinca = $1 AND estado IN ('CONFIRMADA', 'PAGADA')
          AND fechainicio <= $3::date AND fechafin >= $2::date`,
      [idfinca, inicio, fin],
    );
    if (choque) {
      throw new ConflictException(`El período se cruza con la nómina #${choque.idnomina} ya confirmada o pagada`);
    }

    const lineas = await this.lineasDelPeriodo(idfinca, inicio, fin);

    const idnomina = await this.ds.transaction(async (m) => {
      // Un borrador del mismo período se reemplaza por el nuevo cálculo
      await m.query(
        `DELETE FROM nomina WHERE idfinca = $1 AND estado = 'BORRADOR'
            AND fechainicio <= $3::date AND fechafin >= $2::date`,
        [idfinca, inicio, fin],
      );

      let total = 0;
      const detalle = lineas
        .map((l: any) => {
          const unidades = unidadesDePago(l.tipopago, inicio, fin, l.diastrabajados);
          const bruto = brutoDePago(unidades, l.valorpago);
          return { idempleado: l.idempleado, tipopago: l.tipopago, unidades, valor: l.valorpago, bruto };
        })
        // Quien cobra por día y no trabajó ningún día del período no genera línea
        .filter((d: any) => d.bruto > 0);
      for (const d of detalle) total += d.bruto;

      const [n] = await m.query(
        `INSERT INTO nomina (idfinca, fechainicio, fechafin, total, idadmin)
         VALUES ($1, $2::date, $3::date, $4, $5) RETURNING idnomina`,
        [idfinca, inicio, fin, r2(total), idadmin],
      );
      for (const d of detalle) {
        await m.query(
          `INSERT INTO nomina_detalle (idnomina, idempleado, horas, jornadas, valorhora, valorjornal, bruto, deducciones, neto, tipopago)
           VALUES ($1, $2, 0, $3, 0, $4, $5, 0, $5, $6)`,
          [n.idnomina, d.idempleado, d.unidades, d.valor, d.bruto, d.tipopago],
        );
      }
      return n.idnomina as number;
    });

    return this.obtener(idnomina, idfinca);
  }

  listar(idfinca: number) {
    return this.ds.query(
      `SELECT n.idnomina, n.fechainicio, n.fechafin, n.estado, n.total::float8 AS total,
              (SELECT COUNT(*)::int FROM nomina_detalle d WHERE d.idnomina = n.idnomina) AS empleados
         FROM nomina n WHERE n.idfinca = $1 ORDER BY n.fechainicio DESC, n.idnomina DESC`,
      [idfinca],
    );
  }

  async obtener(idnomina: number, idfinca: number) {
    const [nomina] = await this.ds.query(
      `SELECT idnomina, fechainicio, fechafin, estado, total::float8 AS total
         FROM nomina WHERE idnomina = $1 AND idfinca = $2`,
      [idnomina, idfinca],
    );
    if (!nomina) throw new NotFoundException('Nómina no encontrada en esta finca');

    const detalles = await this.ds.query(
      `SELECT d.idnominadetalle, d.idempleado, u.primernombre, u.primerapellido,
              d.horas::float8 AS horas, d.jornadas::float8 AS jornadas,
              d.valorhora::float8 AS valorhora, d.valorjornal::float8 AS valorjornal, d.tipopago,
              d.bruto::float8 AS bruto, d.deducciones::float8 AS deducciones, d.neto::float8 AS neto,
              d.pagado, d.fechapago
         FROM nomina_detalle d JOIN usuario u ON u.idusuario = d.idempleado
        WHERE d.idnomina = $1 ORDER BY u.primernombre`,
      [idnomina],
    );
    return { ...nomina, detalles };
  }

  async ajustarDeducciones(idnominadetalle: number, deducciones: number, idfinca: number) {
    this.exigirOnline();
    const idnomina = await this.ds.transaction(async (m) => {
      const [d] = await m.query(
        `SELECT d.idnomina, d.bruto::float8 AS bruto
           FROM nomina_detalle d JOIN nomina n ON n.idnomina = d.idnomina
          WHERE d.idnominadetalle = $1 AND n.idfinca = $2 AND n.estado = 'BORRADOR' FOR UPDATE OF d`,
        [idnominadetalle, idfinca],
      );
      if (!d) throw new NotFoundException('Línea de nómina no encontrada o la nómina ya no es un borrador');
      if (deducciones > d.bruto) throw new BadRequestException('Las deducciones no pueden superar el pago bruto');

      await m.query(`UPDATE nomina_detalle SET deducciones = $2, neto = $3 WHERE idnominadetalle = $1`, [
        idnominadetalle, deducciones, r2(d.bruto - deducciones),
      ]);
      await m.query(
        `UPDATE nomina SET total = (SELECT COALESCE(SUM(neto), 0) FROM nomina_detalle WHERE idnomina = $1) WHERE idnomina = $1`,
        [d.idnomina],
      );
      return d.idnomina as number;
    });
    return this.obtener(idnomina, idfinca);
  }

  /**
   * Corrige los días (o semanas / meses) pagados a un empleado mientras la nómina es un borrador.
   * El bruto se recalcula con el valor acordado; las deducciones ya puestas se conservan.
   */
  async ajustarUnidades(idnominadetalle: number, unidades: number, idfinca: number) {
    this.exigirOnline();
    const idnomina = await this.ds.transaction(async (m) => {
      const [d] = await m.query(
        `SELECT d.idnomina, d.valorjornal::float8 AS valor, d.deducciones::float8 AS deducciones
           FROM nomina_detalle d JOIN nomina n ON n.idnomina = d.idnomina
          WHERE d.idnominadetalle = $1 AND n.idfinca = $2 AND n.estado = 'BORRADOR' FOR UPDATE OF d`,
        [idnominadetalle, idfinca],
      );
      if (!d) throw new NotFoundException('Línea de nómina no encontrada o la nómina ya no es un borrador');
      const bruto = brutoDePago(unidades, d.valor);
      if (d.deducciones > bruto) throw new BadRequestException('Las deducciones ya registradas superan el nuevo pago bruto');

      await m.query(
        `UPDATE nomina_detalle SET jornadas = $2, bruto = $3, neto = $4 WHERE idnominadetalle = $1`,
        [idnominadetalle, unidades, bruto, r2(bruto - d.deducciones)],
      );
      await m.query(
        `UPDATE nomina SET total = (SELECT COALESCE(SUM(neto), 0) FROM nomina_detalle WHERE idnomina = $1) WHERE idnomina = $1`,
        [d.idnomina],
      );
      return d.idnomina as number;
    });
    return this.obtener(idnomina, idfinca);
  }

  async confirmar(idnomina: number, idfinca: number, idadmin: number) {
    this.exigirOnline();
    const [n] = filas(
      await this.ds.query(
        `UPDATE nomina SET estado = 'CONFIRMADA', idadmin = $3
          WHERE idnomina = $1 AND idfinca = $2 AND estado = 'BORRADOR' RETURNING idnomina`,
        [idnomina, idfinca, idadmin],
      ),
    );
    if (!n) throw new ConflictException('Solo se puede confirmar una nómina en borrador de tu finca');
    return this.obtener(idnomina, idfinca);
  }

  /** Registra el pago: todas las líneas quedan pagadas con la fecha de hoy. */
  async pagar(idnomina: number, idfinca: number) {
    this.exigirOnline();
    await this.ds.transaction(async (m) => {
      const [n] = filas(
        await m.query(
          `UPDATE nomina SET estado = 'PAGADA'
            WHERE idnomina = $1 AND idfinca = $2 AND estado = 'CONFIRMADA' RETURNING idnomina`,
          [idnomina, idfinca],
        ),
      );
      if (!n) throw new ConflictException('Solo se puede pagar una nómina confirmada de tu finca');
      await m.query(
        `UPDATE nomina_detalle SET pagado = true, fechapago = CURRENT_DATE WHERE idnomina = $1`,
        [idnomina],
      );
    });
    return this.obtener(idnomina, idfinca);
  }

  async eliminar(idnomina: number, idfinca: number) {
    this.exigirOnline();
    const borradas = filas(
      await this.ds.query(
        `DELETE FROM nomina WHERE idnomina = $1 AND idfinca = $2 AND estado = 'BORRADOR' RETURNING idnomina`,
        [idnomina, idfinca],
      ),
    );
    if (!borradas.length) throw new ConflictException('Solo se pueden eliminar nóminas en borrador de tu finca');
    return { message: 'Nómina eliminada' };
  }
}
