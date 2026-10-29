/**
 * Pago de un empleado en un período de nómina. Se paga lo acordado (por día, semana o mes), nunca
 * por las horas que reporte en sus tareas.
 *
 *   dia    → días trabajados × valor del día. Un día cuenta si el empleado inició o completó alguna tarea.
 *   semana → valor de la semana × (días del período ÷ 7)
 *   mes    → valor del mes × meses del período (meses calendario completos; si no, días ÷ 30)
 */

export type TipoPago = 'dia' | 'semana' | 'mes';

const MS_DIA = 86_400_000;
const aUTC = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const r2 = (n: number) => Math.round(n * 100) / 100;

export function diasDelPeriodo(inicio: string, fin: string): number {
  return Math.round((aUTC(fin) - aUTC(inicio)) / MS_DIA) + 1;
}

/** Meses que cubre el período: meses calendario completos (1 ene–28 feb = 2); si no, días ÷ 30. */
export function mesesDelPeriodo(inicio: string, fin: string): number {
  const [yi, mi, di] = inicio.slice(0, 10).split('-').map(Number);
  const [yf, mf] = fin.slice(0, 10).split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(yf, mf, 0)).getUTCDate();
  const finDeMes = Number(fin.slice(8, 10)) === ultimoDia;
  if (di === 1 && finDeMes) return (yf - yi) * 12 + (mf - mi) + 1;
  return r2(diasDelPeriodo(inicio, fin) / 30);
}

/** Cuántas unidades de pago (días, semanas o meses) corresponden al empleado en el período. */
export function unidadesDePago(tipo: string, inicio: string, fin: string, diasTrabajados: number): number {
  if (tipo === 'semana') return r2(diasDelPeriodo(inicio, fin) / 7);
  if (tipo === 'mes') return mesesDelPeriodo(inicio, fin);
  return diasTrabajados;
}

export function brutoDePago(unidades: number, valor: number): number {
  return r2(unidades * valor);
}

export const ETIQUETA_UNIDAD: Record<string, string> = { dia: 'días', semana: 'semanas', mes: 'meses' };
