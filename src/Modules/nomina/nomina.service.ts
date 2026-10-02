// src/Modules/nomina/nomina.service.ts
//
// Nómina y control de pagos (EP-11, CU-38, Premium).
//
// Cómo se calcula el pago de cada empleado en el período (según tareas con fecha programada
// dentro del rango):
//     bruto = horas × valor/hora  +  jornadas × valor/jornal  +  pago acordado de las asignaciones
//             COMPLETADAS que no tienen horas ni jornadas registradas (tareas "a destajo")
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

const r2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class NominaService {
  constructor(private readonly ds: DataSource) {}

  private exigirOnline() {
    if (!this.ds.isInitialized) {
      throw new ServiceUnavailableException('La nómina requiere conexión a internet');
    }
  }

  private lineasDelPeriodo(idfinca: number, inicio: string, fin: string) {
    return this.ds.query(
      `WITH base AS (
         SELECT a.idempleado,
                COALESCE(a.horastrabajadas, 0)    AS horas,
                COALESCE(a.jornadastrabajadas, 0) AS jornadas,
                CASE WHEN COALESCE(a.horastrabajadas, 0) = 0
                      AND COALESCE(a.jornadastrabajadas, 0) = 0
                      AND a.estado ILIKE 'completad%'
                     THEN COALESCE(a.pagoacordado, 0) ELSE 0 END AS fijo,
                COALESCE(e.montoporhora, 0)   AS valorhora,
                COALESCE(e.montoporjornal, 0) AS valorjornal
           FROM asignacion_tarea a
           JOIN tarea t    ON t.idtarea = a.idtarea AND t.idfinca = a.idfinca
           JOIN empleado e ON e.idusuario = a.idempleado
          WHERE a.idfinca = $1 AND t.fechaprogramada BETWEEN $2::date AND $3::date
       )
       SELECT idempleado,
              SUM(horas)::float8 AS horas, SUM(jornadas)::float8 AS jornadas,
              valorhora::float8 AS valorhora, valorjornal::float8 AS valorjornal,
              SUM(fijo)::float8 AS fijo
         FROM base
        GROUP BY idempleado, valorhora, valorjornal
       HAVING SUM(horas) > 0 OR SUM(jornadas) > 0 OR SUM(fijo) > 0`,
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
      const detalle = lineas.map((l: any) => {
        const bruto = r2(l.horas * l.valorhora + l.jornadas * l.valorjornal + l.fijo);
        total += bruto;
        return { ...l, bruto };
      });

      const [n] = await m.query(
        `INSERT INTO nomina (idfinca, fechainicio, fechafin, total, idadmin)
         VALUES ($1, $2::date, $3::date, $4, $5) RETURNING idnomina`,
        [idfinca, inicio, fin, r2(total), idadmin],
      );
      for (const d of detalle) {
        await m.query(
          `INSERT INTO nomina_detalle (idnomina, idempleado, horas, jornadas, valorhora, valorjornal, bruto, deducciones, neto)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $7)`,
          [n.idnomina, d.idempleado, d.horas, d.jornadas, d.valorhora, d.valorjornal, d.bruto],
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
              d.valorhora::float8 AS valorhora, d.valorjornal::float8 AS valorjornal,
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
