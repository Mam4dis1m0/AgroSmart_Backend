/**
 * Costo de una tarea: insumos usados + mano de obra + transporte.
 *
 * La mano de obra NO sale de lo que se le paga a cada persona ni de una tarifa por tarea: es el tiempo
 * trabajado en la tarea (suma de las horas de todas las personas) × el costo promedio por hora de la
 * finca (ver mano-obra.ts). Así lo que un empleado reporte no cambia su sueldo, solo cómo se reparte
 * el costo entre las tareas.
 *
 * Parámetros: $1 = idtarea, $2 = idfinca.
 */
export const COSTO_TAREA_SQL = `
  SELECT
    COALESCE((SELECT SUM(d.cantidadusada * COALESCE(i.costounitario, 0))
                FROM detalle_tarea d JOIN insumo i ON i.idinsumo = d.idinsumo
               WHERE d.idtarea = $1 AND d.idfinca = $2), 0)::float8 AS insumos,
    COALESCE((SELECT SUM(COALESCE(a.horastrabajadas, 0))
                FROM asignacion_tarea a
               WHERE a.idtarea = $1 AND a.idfinca = $2), 0)::float8 AS horas,
    COALESCE((SELECT count(DISTINCT a.idempleado)
                FROM asignacion_tarea a
               WHERE a.idtarea = $1 AND a.idfinca = $2 AND COALESCE(a.horastrabajadas, 0) > 0), 0)::int AS personas,
    COALESCE((SELECT costotransporte FROM tarea WHERE idtarea = $1 AND idfinca = $2), 0)::float8 AS transporte`;

export interface FilaCosto {
  insumos: number;
  horas: number;
  personas: number;
  transporte: number;
}

export interface DesgloseCosto {
  insumos: number;
  /** Horas-persona trabajadas en la tarea. */
  horas: number;
  personas: number;
  costoHora: number;
  mano: number;
  transporte: number;
  total: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Une lo medido en la tarea con el costo por hora de la finca. */
export function armarCosto(fila: Partial<FilaCosto> | undefined, costoHora: number): DesgloseCosto {
  const insumos = fila?.insumos ?? 0;
  const horas = fila?.horas ?? 0;
  const transporte = fila?.transporte ?? 0;
  const mano = r2(horas * costoHora);
  return {
    insumos, horas, personas: fila?.personas ?? 0, costoHora, mano, transporte,
    total: r2(insumos + mano + transporte),
  };
}
