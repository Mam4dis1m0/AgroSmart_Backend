/** Fechas de calendario (YYYY-MM-DD) sin depender de la zona horaria del servidor. */

export function sumarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

export function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Fecha de referencia de una plantilla según el cultivo. null si el cultivo no tiene el dato. */
export function fechaBase(
  base: string,
  cultivo: { fechasiembra?: string | null; fechacosechaestimada?: string | null },
): string | null {
  if (base === 'cosecha_estimada') return cultivo.fechacosechaestimada?.slice(0, 10) ?? null;
  if (base === 'inicio') return cultivo.fechasiembra?.slice(0, 10) ?? hoy();
  return cultivo.fechasiembra?.slice(0, 10) ?? null;
}
