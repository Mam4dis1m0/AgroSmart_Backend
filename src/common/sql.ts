// src/common/sql.ts

/**
 * TypeORM devuelve distinto el resultado de manager.query():
 *   SELECT / INSERT ... RETURNING → filas
 *   UPDATE / DELETE ... RETURNING → [filas, cantidadAfectada]
 * Este helper normaliza ambos casos a un arreglo de filas.
 */
export function filas<T = any>(resultado: any): T[] {
  if (!Array.isArray(resultado)) return [];
  if (resultado.length === 2 && Array.isArray(resultado[0]) && typeof resultado[1] === 'number') {
    return resultado[0] as T[];
  }
  return resultado as T[];
}

/** Violación de unicidad de Postgres (correo, cédula, nombre de finca...). */
export function esViolacionUnica(err: any): boolean {
  return err?.code === '23505';
}

/** Hoy en formato YYYY-MM-DD (zona local del servidor). */
export function hoyISO(): string {
  return new Date().toISOString().split('T')[0];
}
