import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { filas } from '../../common/sql';

/**
 * Avisos dentro de la app sobre fechas de tareas, una vez al día (7 a.m., hora de Colombia):
 *  · "por vencer": tareas abiertas que vencen hoy o mañana → al empleado asignado (una sola vez por tarea).
 *  · "atrasada": a 1, 3 y 7 días de vencida → al empleado y a quien la asignó.
 * Corre sin sesión de usuario: solo SQL, con la finca explícita en cada fila.
 */
@Injectable()
export class AvisosTareasService {
  private readonly logger = new Logger(AvisosTareasService.name);

  constructor(private readonly ds: DataSource) {}

  @Cron('0 7 * * *', { timeZone: 'America/Bogota' })
  async avisosDiarios() {
    await this.generar();
  }

  /** Crea los avisos que correspondan hoy. Devuelve cuántos creó. */
  async generar(): Promise<number> {
    if (!this.ds.isInitialized) return 0;
    try {
      // Por vencer (hoy o mañana) → empleado; solo la primera vez
      const porVencer = filas<{ id: number }>(
        await this.ds.query(
          `INSERT INTO notificacion (idfinca, idusuariodestino, titulo, mensaje, tipo, tabla_origen, idregistro)
           SELECT t.idfinca, a.idempleado,
                  CASE WHEN t.fechaprogramada = current_date THEN 'Tarea para hoy' ELSE 'Tarea para mañana' END,
                  COALESCE(t.tipoactividad, 'Tarea') || ' vence ' ||
                  CASE WHEN t.fechaprogramada = current_date THEN 'hoy' ELSE 'mañana' END,
                  'tarea_por_vencer', 'tarea', t.idtarea
             FROM tarea t JOIN asignacion_tarea a ON a.idtarea = t.idtarea AND a.idfinca = t.idfinca
            WHERE t.fechaprogramada BETWEEN current_date AND current_date + 1
              AND lower(COALESCE(t.estado, '')) NOT LIKE 'completad%'
              AND COALESCE(a.estado, '') NOT IN ('Completado', 'Reasignada')
              AND NOT EXISTS (SELECT 1 FROM notificacion n
                               WHERE n.tipo = 'tarea_por_vencer' AND n.idregistro = t.idtarea
                                 AND n.idusuariodestino = a.idempleado AND n.fecha::date >= t.fechaprogramada - 1)
           RETURNING idnotificacion AS id`,
        ),
      );

      // Atrasadas a 1, 3 y 7 días → empleado y quien asignó (o creó) la tarea
      const atrasadas = filas<{ id: number }>(
        await this.ds.query(
          `INSERT INTO notificacion (idfinca, idusuariodestino, titulo, mensaje, tipo, tabla_origen, idregistro)
           SELECT d.idfinca, d.destino, 'Tarea atrasada',
                  COALESCE(d.tipoactividad, 'Tarea') || ' lleva ' || d.dias || (CASE WHEN d.dias = 1 THEN ' día' ELSE ' días' END) || ' de atraso',
                  'tarea_atrasada', 'tarea', d.idtarea
             FROM (
               SELECT t.idfinca, t.idtarea, t.tipoactividad, (current_date - t.fechaprogramada) AS dias, a.idempleado AS destino
                 FROM tarea t JOIN asignacion_tarea a ON a.idtarea = t.idtarea AND a.idfinca = t.idfinca
                WHERE COALESCE(a.estado, '') NOT IN ('Completado', 'Reasignada')
               UNION
               SELECT t.idfinca, t.idtarea, t.tipoactividad, (current_date - t.fechaprogramada), COALESCE(a.idadminasignador, t.idadmincreador)
                 FROM tarea t JOIN asignacion_tarea a ON a.idtarea = t.idtarea AND a.idfinca = t.idfinca
                WHERE COALESCE(a.estado, '') NOT IN ('Completado', 'Reasignada')
             ) d
            WHERE d.dias IN (1, 3, 7) AND d.destino IS NOT NULL
              AND EXISTS (SELECT 1 FROM tarea x WHERE x.idtarea = d.idtarea AND lower(COALESCE(x.estado, '')) NOT LIKE 'completad%')
              AND NOT EXISTS (SELECT 1 FROM notificacion n
                               WHERE n.tipo = 'tarea_atrasada' AND n.idregistro = d.idtarea
                                 AND n.idusuariodestino = d.destino AND n.fecha::date = current_date)
           RETURNING idnotificacion AS id`,
        ),
      );

      const total = porVencer.length + atrasadas.length;
      if (total) this.logger.log(`🔔 ${total} aviso(s) de tareas creados`);
      return total;
    } catch (err) {
      this.logger.warn(`avisos de tareas: ${(err as Error).message}`);
      return 0;
    }
  }
}
