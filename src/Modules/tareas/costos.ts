/**
 * Costo de una tarea: insumos usados + mano de obra + transporte.
 * Mano de obra = horas × tarifa/hora + jornales × tarifa/jornal; si la asignación no tiene horas ni
 * jornales (trabajo a destajo) se toma el pago acordado, salvo que haya sido reasignada (no se hizo).
 * Es la misma regla que usa la nómina. Parámetros: $1 = idtarea, $2 = idfinca.
 */
export const COSTO_TAREA_SQL = `
  SELECT
    COALESCE((SELECT SUM(d.cantidadusada * COALESCE(i.costounitario, 0))
                FROM detalle_tarea d JOIN insumo i ON i.idinsumo = d.idinsumo
               WHERE d.idtarea = $1 AND d.idfinca = $2), 0)::float8 AS insumos,
    COALESCE((SELECT SUM(CASE
                 WHEN COALESCE(a.horastrabajadas, 0) = 0 AND COALESCE(a.jornadastrabajadas, 0) = 0
                   THEN CASE WHEN a.estado = 'Reasignada' THEN 0 ELSE COALESCE(a.pagoacordado, 0) END
                 ELSE COALESCE(a.horastrabajadas, 0)    * COALESCE(e.montoporhora, 0)
                    + COALESCE(a.jornadastrabajadas, 0) * COALESCE(e.montoporjornal, 0)
               END)
                FROM asignacion_tarea a LEFT JOIN empleado e ON e.idusuario = a.idempleado
               WHERE a.idtarea = $1 AND a.idfinca = $2), 0)::float8 AS mano,
    COALESCE((SELECT costotransporte FROM tarea WHERE idtarea = $1 AND idfinca = $2), 0)::float8 AS transporte`;

export interface DesgloseCosto {
  insumos: number;
  mano: number;
  transporte: number;
}

export const totalCosto = (r?: Partial<DesgloseCosto>): number =>
  Math.round(((r?.insumos ?? 0) + (r?.mano ?? 0) + (r?.transporte ?? 0)) * 100) / 100;
