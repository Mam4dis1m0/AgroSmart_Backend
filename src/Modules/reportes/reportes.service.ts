// src/Modules/reportes/reportes.service.ts
//
//  · costosPorCultivo → CU-39 / RF-38 "Control de insumos por pagos": costo de insumos + mano de obra
//    consolidado por cultivo (Premium).
//  · exportar → CU-40 / RF-39 "Exportar a Excel" (Premium): gastos, insumos y cultivo.
//
// ⚠️ La exportación entrega un CSV con BOM UTF-8 y separador ";" que Excel abre directamente
// en configuración regional es-CO. Para un .xlsx real hay que agregar la librería "exceljs"
// (no se pudo instalar en este entorno): solo habría que reemplazar toCsv() por un Workbook.

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

type Fila = Record<string, unknown>;

@Injectable()
export class ReportesService {
  constructor(private readonly ds: DataSource) {}

  private exigirOnline() {
    if (!this.ds.isInitialized) {
      throw new ServiceUnavailableException('Los reportes requieren conexión a internet');
    }
  }

  // ── CU-39 ─────────────────────────────────────────────────────────────────
  costosPorCultivo(idfinca: number, desde?: string, hasta?: string): Promise<Fila[]> {
    this.exigirOnline();
    return this.ds.query(
      `WITH ins AS (
         SELECT t.idcultivo,
                SUM(d.cantidadusada * COALESCE(i.costounitario, 0)) AS costo
           FROM detalle_tarea d
           JOIN tarea  t ON t.idtarea = d.idtarea
           JOIN insumo i ON i.idinsumo = d.idinsumo
          WHERE t.idfinca = $1
            AND ($2::date IS NULL OR t.fechaprogramada >= $2::date)
            AND ($3::date IS NULL OR t.fechaprogramada <= $3::date)
          GROUP BY t.idcultivo
       ), lab AS (
         SELECT t.idcultivo,
                SUM(COALESCE(a.horastrabajadas, 0)    * COALESCE(e.montoporhora, 0)
                  + COALESCE(a.jornadastrabajadas, 0) * COALESCE(e.montoporjornal, 0)) AS costo
           FROM asignacion_tarea a
           JOIN tarea    t ON t.idtarea = a.idtarea
           JOIN empleado e ON e.idusuario = a.idempleado
          WHERE t.idfinca = $1
            AND ($2::date IS NULL OR t.fechaprogramada >= $2::date)
            AND ($3::date IS NULL OR t.fechaprogramada <= $3::date)
          GROUP BY t.idcultivo
       )
       SELECT c.idcultivo, c.nombrelote AS cultivo,
              COALESCE(ins.costo, 0)::float8 AS costo_insumos,
              COALESCE(lab.costo, 0)::float8 AS costo_mano_obra,
              (COALESCE(ins.costo, 0) + COALESCE(lab.costo, 0))::float8 AS total
         FROM cultivo c
         LEFT JOIN ins ON ins.idcultivo = c.idcultivo
         LEFT JOIN lab ON lab.idcultivo = c.idcultivo
        WHERE c.idfinca = $1
        ORDER BY total DESC, c.nombrelote`,
      [idfinca, desde ?? null, hasta ?? null],
    );
  }

  // ── CU-40 ─────────────────────────────────────────────────────────────────
  async exportar(
    idfinca: number,
    tipo: 'gastos' | 'insumos' | 'cultivo',
    desde?: string,
    hasta?: string,
  ): Promise<{ nombre: string; csv: string }> {
    this.exigirOnline();
    const hoy = new Date().toISOString().slice(0, 10);

    if (tipo === 'gastos') {
      const filas: Fila[] = await this.ds.query(
        `SELECT c.fechacompra::text AS fecha, 'Compra de insumo' AS concepto, i.nombre AS detalle,
                c.cantidad::float8 AS cantidad, c.costototal::float8 AS valor
           FROM compra_insumo c JOIN insumo i ON i.idinsumo = c.idinsumo
          WHERE c.idfinca = $1
            AND ($2::date IS NULL OR c.fechacompra >= $2::date)
            AND ($3::date IS NULL OR c.fechacompra <= $3::date)
         UNION ALL
         SELECT n.fechafin::text AS fecha, 'Nómina ' || lower(n.estado) AS concepto,
                'Período ' || n.fechainicio || ' a ' || n.fechafin AS detalle,
                NULL AS cantidad, n.total::float8 AS valor
           FROM nomina n
          WHERE n.idfinca = $1 AND n.estado IN ('CONFIRMADA', 'PAGADA')
            AND ($2::date IS NULL OR n.fechafin >= $2::date)
            AND ($3::date IS NULL OR n.fechafin <= $3::date)
         UNION ALL
         SELECT t.fechaprogramada::text AS fecha, 'Transporte' AS concepto, t.tipoactividad AS detalle,
                NULL AS cantidad, t.costotransporte::float8 AS valor
           FROM tarea t
          WHERE t.idfinca = $1 AND COALESCE(t.costotransporte, 0) > 0
            AND ($2::date IS NULL OR t.fechaprogramada >= $2::date)
            AND ($3::date IS NULL OR t.fechaprogramada <= $3::date)
         ORDER BY fecha DESC`,
        [idfinca, desde ?? null, hasta ?? null],
      );
      return { nombre: `gastos_${hoy}.csv`, csv: this.toCsv(filas, ['fecha', 'concepto', 'detalle', 'cantidad', 'valor']) };
    }

    if (tipo === 'insumos') {
      const filas: Fila[] = await this.ds.query(
        `SELECT nombre, tipo, unidadmedida AS unidad, stockactual::float8 AS stock_actual,
                stockminimo::float8 AS stock_minimo, costounitario::float8 AS costo_unitario,
                (COALESCE(stockactual, 0) * COALESCE(costounitario, 0))::float8 AS valor_inventario,
                CASE WHEN stockactual <= stockminimo THEN 'STOCK BAJO' ELSE 'OK' END AS estado
           FROM insumo WHERE idfinca = $1 ORDER BY nombre`,
        [idfinca],
      );
      return {
        nombre: `insumos_${hoy}.csv`,
        csv: this.toCsv(filas, ['nombre', 'tipo', 'unidad', 'stock_actual', 'stock_minimo', 'costo_unitario', 'valor_inventario', 'estado']),
      };
    }

    // cultivo
    const filas: Fila[] = await this.ds.query(
      `SELECT c.nombrelote AS cultivo, c.tipo, c.fechasiembra::text AS fecha_siembra,
              c.fechacosechaestimada::text AS fecha_cosecha_estimada,
              COALESCE((SELECT SUM(h.cantidad) FROM cosecha h WHERE h.idcultivo = c.idcultivo
                         AND ($2::date IS NULL OR h.fechacosecha >= $2::date)
                         AND ($3::date IS NULL OR h.fechacosecha <= $3::date)), 0)::float8 AS cosechado,
              (SELECT COUNT(*)::int FROM tarea t WHERE t.idcultivo = c.idcultivo) AS tareas
         FROM cultivo c WHERE c.idfinca = $1 ORDER BY c.nombrelote`,
      [idfinca, desde ?? null, hasta ?? null],
    );
    return {
      nombre: `cultivos_${hoy}.csv`,
      csv: this.toCsv(filas, ['cultivo', 'tipo', 'fecha_siembra', 'fecha_cosecha_estimada', 'cosechado', 'tareas']),
    };
  }

  /** CSV para Excel es-CO: separador ";", BOM UTF-8, comillas escapadas y sin inyección de fórmulas. */
  private toCsv(filas: Fila[], columnas: string[]): string {
    const celda = (v: unknown): string => {
      if (v === null || v === undefined) return '';
      let s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
      // Evita que Excel interprete texto del usuario como fórmula (=, +, -, @)
      if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`;
      return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lineas = [columnas.join(';'), ...filas.map((f) => columnas.map((c) => celda(f[c])).join(';'))];
    return '﻿' + lineas.join('\r\n');
  }
}
