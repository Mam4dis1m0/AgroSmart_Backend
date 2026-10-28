import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { filas } from '../../common/sql';
import { AuthUser } from '../../auth/tenant-context';
import { COSTO_TAREA_SQL, DesgloseCosto, totalCosto } from './costos';

export interface InsumoSugerido {
  /** Insumo propuesto (null si la finca no tiene ninguno de ese tipo). */
  idinsumo: number | null;
  nombre: string;
  unidad: string | null;
  /** Cantidad propuesta: la de la plantilla o el promedio de lo usado antes en esta labor. */
  cantidad: number | null;
  stockactual: number | null;
  origen: 'plantilla' | 'historial';
  tipoinsumo: string | null;
  /** Otros insumos de la finca del mismo tipo, por si el empleado prefiere otro. */
  candidatos: { idinsumo: number; nombre: string; unidadmedida: string | null; stockactual: number }[];
}

export interface PagoSugerido {
  modalidad: 'tiempo' | 'fijo';
  sugerido: number | null;
  base: 'tarifa' | 'historico' | null;
  detalle: string | null;
  muestras: number;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * Valores que el sistema propone para no digitarlos: insumos de la labor, pago del empleado y
 * desglose de costos. Todo se calcula con lo que ya se hizo en la finca (historial) y las plantillas.
 */
@Injectable()
export class TareaSugerenciasService {
  constructor(private readonly ds: DataSource) {}

  /** La tarea debe ser de la finca y, si quien consulta es empleado, estarle asignada. */
  private async acceso(idfinca: number, idtarea: number, user: AuthUser) {
    const [t] = filas<{ tipoactividad: string | null; idplantilla: number | null; horasestimadas: number | null; costototal: number | null }>(
      await this.ds.query(
        `SELECT tipoactividad, idplantilla, horasestimadas::float8 AS horasestimadas, costototal::float8 AS costototal
           FROM tarea WHERE idtarea = $1 AND idfinca = $2`,
        [idtarea, idfinca],
      ),
    );
    if (!t) throw new NotFoundException(`Tarea #${idtarea} no encontrada.`);
    if (user.rol === 'empleado') {
      const [a] = await this.ds.query(
        `SELECT 1 FROM asignacion_tarea WHERE idtarea = $1 AND idfinca = $2 AND idempleado = $3 AND COALESCE(estado, '') <> 'Reasignada'`,
        [idtarea, idfinca, user.idusuario],
      );
      if (!a) throw new ForbiddenException('Esta tarea no te fue asignada');
    }
    return t;
  }

  async insumosSugeridos(idfinca: number, idtarea: number, user: AuthUser): Promise<InsumoSugerido[]> {
    const t = await this.acceso(idfinca, idtarea, user);
    const actividad = t.tipoactividad ?? '';

    const yaUsados = new Set(
      filas<{ idinsumo: number }>(
        await this.ds.query(`SELECT idinsumo FROM detalle_tarea WHERE idtarea = $1 AND idfinca = $2`, [idtarea, idfinca]),
      ).map((r) => r.idinsumo),
    );

    // Lo que se gastó en esta labor las veces anteriores: promedio y frecuencia por insumo
    const historial = filas<{ idinsumo: number; nombre: string; unidadmedida: string | null; stockactual: number; cantidad: number }>(
      await this.ds.query(
        `SELECT d.idinsumo, i.nombre, i.unidadmedida, i.stockactual::float8 AS stockactual,
                AVG(d.cantidadusada)::float8 AS cantidad
           FROM detalle_tarea d
           JOIN tarea x  ON x.idtarea = d.idtarea AND x.idfinca = d.idfinca
           JOIN insumo i ON i.idinsumo = d.idinsumo
          WHERE d.idfinca = $1 AND lower(x.tipoactividad) = lower($2) AND x.idtarea <> $3
          GROUP BY d.idinsumo, i.nombre, i.unidadmedida, i.stockactual
          ORDER BY count(*) DESC LIMIT 5`,
        [idfinca, actividad, idtarea],
      ),
    );
    const promedio = new Map(historial.map((h) => [h.idinsumo, h.cantidad]));

    const salida: InsumoSugerido[] = [];
    const vistos = new Set<number>();

    if (t.idplantilla) {
      const filasPlantilla = filas<{ idinsumo: number | null; tipoinsumo: string | null; unidad: string | null; cantidadsugerida: number | null }>(
        await this.ds.query(
          `SELECT idinsumo, tipoinsumo, unidad, cantidadsugerida::float8 AS cantidadsugerida
             FROM plantilla_labor_insumo WHERE idplantilla = $1 ORDER BY idplantillainsumo`,
          [t.idplantilla],
        ),
      );
      for (const p of filasPlantilla) {
        let candidatos: InsumoSugerido['candidatos'] = [];
        let elegido: { idinsumo: number; nombre: string; unidadmedida: string | null; stockactual: number } | undefined;

        if (p.idinsumo) {
          candidatos = filas(
            await this.ds.query(
              `SELECT idinsumo, nombre, unidadmedida, stockactual::float8 AS stockactual FROM insumo WHERE idinsumo = $1 AND idfinca = $2`,
              [p.idinsumo, idfinca],
            ),
          );
          elegido = candidatos[0];
        } else if (p.tipoinsumo) {
          candidatos = filas(
            await this.ds.query(
              `SELECT idinsumo, nombre, unidadmedida, stockactual::float8 AS stockactual
                 FROM insumo WHERE idfinca = $1 AND tipo ILIKE $2 ORDER BY stockactual DESC LIMIT 5`,
              [idfinca, `%${p.tipoinsumo}%`],
            ),
          );
          // Si ya se usó uno de ese tipo antes en esta labor, ese es el preferido
          elegido = candidatos.find((c) => promedio.has(c.idinsumo)) ?? candidatos.find((c) => c.stockactual > 0) ?? candidatos[0];
        }

        if (elegido && (yaUsados.has(elegido.idinsumo) || vistos.has(elegido.idinsumo))) continue;
        if (elegido) vistos.add(elegido.idinsumo);

        salida.push({
          idinsumo: elegido?.idinsumo ?? null,
          nombre: elegido?.nombre ?? p.tipoinsumo ?? 'Insumo',
          unidad: elegido?.unidadmedida ?? p.unidad,
          cantidad: p.cantidadsugerida ?? (elegido ? promedio.get(elegido.idinsumo) ?? null : null),
          stockactual: elegido?.stockactual ?? null,
          origen: 'plantilla',
          tipoinsumo: p.tipoinsumo,
          candidatos,
        });
      }
    }

    // Labores sin plantilla (o con insumos que la plantilla no cubre): lo que se usó antes
    for (const h of historial) {
      if (yaUsados.has(h.idinsumo) || vistos.has(h.idinsumo)) continue;
      vistos.add(h.idinsumo);
      salida.push({
        idinsumo: h.idinsumo,
        nombre: h.nombre,
        unidad: h.unidadmedida,
        cantidad: redondear(h.cantidad),
        stockactual: h.stockactual,
        origen: 'historial',
        tipoinsumo: null,
        candidatos: [],
      });
    }
    return salida;
  }

  /**
   * Pago que se propone al asignar. Labores por tiempo: horas estimadas × tarifa del empleado.
   * Labores a destajo (cosecha): promedio de lo pagado antes por esa misma labor.
   */
  async pagoSugerido(idfinca: number, idtarea: number, idempleado: number, user: AuthUser): Promise<PagoSugerido> {
    const t = await this.acceso(idfinca, idtarea, user);

    const [p] = filas<{ modalidad: string }>(
      await this.ds.query(
        `SELECT COALESCE(p.modalidadpago, 'tiempo') AS modalidad
           FROM tarea t LEFT JOIN plantilla_labor p ON p.idplantilla = t.idplantilla
          WHERE t.idtarea = $1 AND t.idfinca = $2`,
        [idtarea, idfinca],
      ),
    );
    const modalidad = p?.modalidad === 'fijo' ? 'fijo' : 'tiempo';

    const porTarifa = async (): Promise<PagoSugerido | null> => {
      const [e] = filas<{ hora: number; jornal: number }>(
        await this.ds.query(
          `SELECT COALESCE(montoporhora, 0)::float8 AS hora, COALESCE(montoporjornal, 0)::float8 AS jornal FROM empleado WHERE idusuario = $1`,
          [idempleado],
        ),
      );
      const tarifa = e?.hora > 0 ? e.hora : e?.jornal > 0 ? e.jornal / 8 : 0;
      const horas = t.horasestimadas ?? 0;
      if (!(tarifa > 0 && horas > 0)) return null;
      return {
        modalidad,
        sugerido: Math.round(tarifa * horas),
        base: 'tarifa',
        detalle: `${horas} h × $${Math.round(tarifa).toLocaleString('es-CO')}/h`,
        muestras: 0,
      };
    };

    if (modalidad === 'fijo') {
      const [h] = filas<{ promedio: number | null; muestras: number }>(
        await this.ds.query(
          `SELECT AVG(a.pagoacordado)::float8 AS promedio, count(*)::int AS muestras
             FROM asignacion_tarea a JOIN tarea x ON x.idtarea = a.idtarea
            WHERE a.idfinca = $1 AND a.estado = 'Completado' AND COALESCE(a.pagoacordado, 0) > 0
              AND lower(x.tipoactividad) = lower($2) AND x.idtarea <> $3
              AND x.fechaprogramada >= current_date - 365`,
          [idfinca, t.tipoactividad ?? '', idtarea],
        ),
      );
      if (h?.promedio) {
        return {
          modalidad,
          sugerido: Math.round(h.promedio),
          base: 'historico',
          detalle: `Promedio de ${h.muestras} ${h.muestras === 1 ? 'vez' : 'veces'} anteriores`,
          muestras: h.muestras,
        };
      }
    }
    return (await porTarifa()) ?? { modalidad, sugerido: null, base: null, detalle: null, muestras: 0 };
  }

  async costos(idfinca: number, idtarea: number, user: AuthUser) {
    const t = await this.acceso(idfinca, idtarea, user);
    const [d] = filas<DesgloseCosto>(await this.ds.query(COSTO_TAREA_SQL, [idtarea, idfinca]));
    return {
      estimado: t.costototal ?? 0,
      insumos: d?.insumos ?? 0,
      manoObra: d?.mano ?? 0,
      transporte: d?.transporte ?? 0,
      total: totalCosto(d),
    };
  }

  /** Costo y tiempo promedio de lo ya completado, por labor o por cultivo (base para análisis). */
  async resumen(idfinca: number, agrupar: 'actividad' | 'cultivo') {
    const clave = agrupar === 'cultivo' ? `COALESCE(c.tipo, 'Sin cultivo')` : `COALESCE(t.tipoactividad, 'Sin nombre')`;
    return filas(
      await this.ds.query(
        `SELECT ${clave} AS clave, count(*)::int AS tareas,
                SUM(t.costoreal)::float8 AS costototal, AVG(t.costoreal)::float8 AS costopromedio,
                AVG(h.horas)::float8 AS horaspromedio, AVG(NULLIF(t.costototal, 0))::float8 AS estimadopromedio
           FROM tarea t
           LEFT JOIN cultivo c ON c.idcultivo = t.idcultivo
           LEFT JOIN LATERAL (SELECT SUM(a.horastrabajadas) AS horas FROM asignacion_tarea a WHERE a.idtarea = t.idtarea) h ON true
          WHERE t.idfinca = $1 AND t.costoreal IS NOT NULL
          GROUP BY ${clave}
          ORDER BY SUM(t.costoreal) DESC`,
        [idfinca],
      ),
    );
  }
}
