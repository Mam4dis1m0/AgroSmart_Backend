import { filas } from '../../common/sql';

/**
 * Mano de obra de la finca. El sueldo NO depende de lo que cada empleado reporte en sus tareas:
 * se paga por día, semana o mes. Las horas registradas en una tarea solo sirven para repartir ese
 * costo entre las tareas (costeo), con una sola tarifa promedio por hora para toda la finca:
 *
 *   pago diario promedio  = promedio del pago por día de los empleados con pago configurado
 *   pago diario del equipo = personas de un día normal × pago diario promedio
 *   costo por hora         = pago diario del equipo ÷ (personas × horas de la jornada)
 *   mano de obra de una tarea = Σ (horas de cada persona en la tarea) × costo por hora
 */

export type TipoPago = 'dia' | 'semana' | 'mes';
export const TIPOS_PAGO: TipoPago[] = ['dia', 'semana', 'mes'];

/** Días que se pagan en una semana / en un mes de trabajo (para llevar el pago a «por día»). */
export const DIAS_SEMANA = 6;
export const DIAS_MES = 26;

export type Consulta = (sql: string, params?: any[]) => Promise<any>;

/** Pago equivalente a un día de trabajo. */
export function pagoDiario(
  tipo: string | null | undefined,
  valor: number,
): number {
  const v = Number(valor) || 0;
  if (tipo === 'semana') return v / DIAS_SEMANA;
  if (tipo === 'mes') return v / DIAS_MES;
  return v;
}

/** Horas netas de una jornada: «07:00», «16:00» y 60 min de descanso → 8. */
export function horasDeJornada(
  inicio: string,
  fin: string,
  descansoMin: number,
): number {
  const aMin = (t: string) => {
    const [h, m] = (t ?? '').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const neto = aMin(fin) - aMin(inicio) - (Number(descansoMin) || 0);
  return Math.max(0, Math.round((neto / 60) * 100) / 100);
}

export interface ManoObra {
  inicio: string;
  fin: string;
  descanso: number;
  horasJornada: number;
  /** Personas que trabajan en un día normal (las que registró el admin o, si no, los empleados activos). */
  personas: number;
  /** Lo que registró el administrador (null = se cuentan todos los empleados activos). */
  personasIndicadas: number | null;
  empleadosConPago: number;
  empleadosSinPago: number;
  pagoDiarioPromedio: number;
  pagoDiarioEquipo: number;
  costoHora: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

const hhmm = (t: string | null | undefined, porDefecto: string) =>
  (t ?? porDefecto).slice(0, 5);

/** Calcula la jornada de la finca y el costo promedio por hora de mano de obra. */
export async function manoObraDeFinca(
  consulta: Consulta,
  idfinca: number,
): Promise<ManoObra> {
  const [f] = filas<{
    inicio: string;
    fin: string;
    descanso: number;
    personas: number | null;
  }>(
    await consulta(
      `SELECT jornadainicio::text AS inicio, jornadafin::text AS fin, jornadadescanso AS descanso, jornadapersonas AS personas
         FROM finca WHERE idfinca = $1`,
      [idfinca],
    ),
  );
  const empleados = filas<{ tipopago: string; valorpago: number }>(
    await consulta(
      `SELECT e.tipopago, e.valorpago::float8 AS valorpago
         FROM empleado e JOIN finca_usuario fu ON fu.idusuario = e.idusuario
        WHERE fu.idfinca = $1 AND fu.rol = 'empleado' AND fu.activo = true`,
      [idfinca],
    ),
  );

  const inicio = hhmm(f?.inicio, '07:00');
  const fin = hhmm(f?.fin, '16:00');
  const descanso = f?.descanso ?? 60;
  const horasJornada = horasDeJornada(inicio, fin, descanso);

  const conPago = empleados.filter((e) => e.valorpago > 0);
  const promedio = conPago.length
    ? conPago.reduce((a, e) => a + pagoDiario(e.tipopago, e.valorpago), 0) /
      conPago.length
    : 0;
  const personas =
    f?.personas && f.personas > 0 ? f.personas : empleados.length;
  const pagoDiarioEquipo = promedio * personas;
  const costoHora =
    personas > 0 && horasJornada > 0
      ? pagoDiarioEquipo / (personas * horasJornada)
      : 0;

  return {
    inicio,
    fin,
    descanso,
    horasJornada,
    personas,
    personasIndicadas: f?.personas && f.personas > 0 ? f.personas : null,
    empleadosConPago: conPago.length,
    empleadosSinPago: empleados.length - conPago.length,
    pagoDiarioPromedio: r2(promedio),
    pagoDiarioEquipo: r2(pagoDiarioEquipo),
    costoHora: r2(costoHora),
  };
}

/** Atajo: solo el costo por hora. */
export async function costoHoraDeFinca(
  consulta: Consulta,
  idfinca: number,
): Promise<number> {
  return (await manoObraDeFinca(consulta, idfinca)).costoHora;
}
