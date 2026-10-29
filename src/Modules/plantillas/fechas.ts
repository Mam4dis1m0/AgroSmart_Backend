/** Fechas de calendario (YYYY-MM-DD) sin depender de la zona horaria del servidor. */

const MS_DIA = 86_400_000;

function aUTC(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function sumarDias(iso: string, dias: number): string {
  return new Date(aUTC(iso) + dias * MS_DIA).toISOString().slice(0, 10);
}

/** Días entre dos fechas (b − a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((aUTC(b) - aUTC(a)) / MS_DIA);
}

export function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Fecha en Colombia (UTC−5) de un instante: una tarea terminada a las 8 p. m. sigue siendo «de hoy». */
export function fechaColombia(d: Date): string {
  return new Date(d.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}

interface CultivoFechas {
  fechasiembra?: string | null;
  fechacosechaestimada?: string | null;
}

/**
 * Fecha de referencia de una plantilla según el cultivo. null si el cultivo no tiene el dato.
 * «inicio» = cuando empieza el trabajo con el cultivo: la siembra si todavía no ocurre; si el cultivo
 * ya está establecido (sembrado antes de hoy), las labores de mantenimiento cuentan desde hoy.
 */
export function fechaBase(
  base: string,
  cultivo: CultivoFechas,
  hoyISO: string = hoy(),
): string | null {
  if (base === 'cosecha_estimada')
    return cultivo.fechacosechaestimada?.slice(0, 10) ?? null;
  const siembra = cultivo.fechasiembra?.slice(0, 10) ?? null;
  if (base === 'inicio') return siembra && siembra >= hoyISO ? siembra : hoyISO;
  return siembra;
}

export interface PlantillaFechas {
  base: string;
  diasoffset: number;
  esrecurrente: boolean;
  frecuenciadias: number | null;
  diasfin: number | null;
}

export interface PrimeraFecha {
  /** Fecha en que se programa la primera tarea; null si no se puede programar. */
  fecha: string | null;
  /** Ya pasó y no se repite: se muestra, pero no se marca por defecto. */
  pasada: boolean;
  /** La fecha original ya había pasado y se corrió a la próxima repetición. */
  ajustada: boolean;
  /** Una labor repetitiva cuyo ciclo ya terminó: no hay próxima fecha. */
  terminada: boolean;
}

/**
 * Primera fecha en que debe programarse una labor. En un cultivo ya establecido las labores
 * repetitivas no se quedan en el pasado: se programa la próxima repetición a partir de hoy
 * (fecha original + k × frecuencia), mientras no se haya cumplido el ciclo de la labor.
 */
export function primeraFecha(
  p: PlantillaFechas,
  cultivo: CultivoFechas,
  hoyISO: string = hoy(),
): PrimeraFecha {
  const base = fechaBase(p.base, cultivo, hoyISO);
  if (!base)
    return { fecha: null, pasada: false, ajustada: false, terminada: false };

  const original = sumarDias(base, p.diasoffset);
  if (original >= hoyISO)
    return {
      fecha: original,
      pasada: false,
      ajustada: false,
      terminada: false,
    };

  const frecuencia = p.frecuenciadias ?? 0;
  if (!p.esrecurrente || frecuencia <= 0)
    return { fecha: original, pasada: true, ajustada: false, terminada: false };

  const saltos = Math.ceil(diasEntre(original, hoyISO) / frecuencia);
  const proxima = sumarDias(original, saltos * frecuencia);
  const limite =
    p.diasfin !== null
      ? sumarDias(base, p.diasfin)
      : (cultivo.fechacosechaestimada?.slice(0, 10) ?? null);
  if (limite && proxima > limite)
    return { fecha: null, pasada: true, ajustada: false, terminada: true };
  return { fecha: proxima, pasada: false, ajustada: true, terminada: false };
}
