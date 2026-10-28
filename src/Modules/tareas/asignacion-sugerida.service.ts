import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { filas } from '../../common/sql';

export interface Sugerencia {
  idusuario: number;
  nombre: string;
  foto: string | null;
  puntaje: number;
  motivos: string[];
  /** Horas ya comprometidas en la semana de la tarea (±3 días). */
  horassemana: number;
}

interface Candidato {
  idusuario: number;
  primernombre: string | null;
  primerapellido: string | null;
  fotoperfil: string | null;
  horassemana: number;
  horasdia: number;
  afinidadactividad: number;
  afinidadcultivo: number;
  continuidad: boolean;
}

/** Jornada que se considera completa: con más horas ese día, la persona ya no está disponible. */
const JORNADA_HORAS = 8;

/**
 * Decide a quién conviene asignar una tarea (carga de trabajo, experiencia en esa labor y en ese
 * cultivo, y continuidad con la ocurrencia anterior). Sirve igual para la sugerencia que ve el
 * administrador y para la asignación automática. Recibe la finca explícita: también lo usan los crons.
 */
@Injectable()
export class AsignacionSugeridaService {
  private readonly logger = new Logger(AsignacionSugeridaService.name);

  constructor(private readonly ds: DataSource) {}

  async modoAsignacion(idfinca: number): Promise<string> {
    const [f] = filas<{ modo: string }>(
      await this.ds.query(`SELECT modoasignacion AS modo FROM finca WHERE idfinca = $1`, [idfinca]),
    );
    return f?.modo ?? 'sugerida';
  }

  async cambiarModo(idfinca: number, modo: string): Promise<string> {
    await this.ds.query(`UPDATE finca SET modoasignacion = $2 WHERE idfinca = $1`, [idfinca, modo]);
    return modo;
  }

  /** Empleados activos de la finca con su situación frente a esta tarea. */
  private async candidatos(idfinca: number, idtarea: number): Promise<{ lista: Candidato[]; numpersonas: number }> {
    const [t] = filas<{ numpersonas: number }>(
      await this.ds.query(
        `SELECT COALESCE(p.numpersonas, 1) AS numpersonas
           FROM tarea t LEFT JOIN plantilla_labor p ON p.idplantilla = t.idplantilla
          WHERE t.idtarea = $2 AND t.idfinca = $1`,
        [idfinca, idtarea],
      ),
    );
    if (!t) throw new NotFoundException(`Tarea #${idtarea} no encontrada.`);

    const lista = filas<Candidato>(
      await this.ds.query(
        `WITH o AS (
           SELECT t.idtarea, t.tipoactividad, t.fechaprogramada, t.idcultivo,
                  COALESCE(t.idtareaorigen, t.idtarea) AS raiz
             FROM tarea t WHERE t.idtarea = $2 AND t.idfinca = $1
         )
         SELECT fu.idusuario, u.primernombre, u.primerapellido, u.fotoperfil,
           COALESCE((SELECT SUM(COALESCE(x.horasestimadas, 2)) FROM asignacion_tarea a
                       JOIN tarea x ON x.idtarea = a.idtarea
                      WHERE a.idempleado = fu.idusuario AND a.idfinca = $1
                        AND COALESCE(a.estado, '') NOT IN ('Completado', 'Reasignada')
                        AND x.idtarea <> o.idtarea AND o.fechaprogramada IS NOT NULL
                        AND x.fechaprogramada BETWEEN o.fechaprogramada - 3 AND o.fechaprogramada + 3), 0)::float8 AS horassemana,
           COALESCE((SELECT SUM(COALESCE(x.horasestimadas, 2)) FROM asignacion_tarea a
                       JOIN tarea x ON x.idtarea = a.idtarea
                      WHERE a.idempleado = fu.idusuario AND a.idfinca = $1
                        AND COALESCE(a.estado, '') NOT IN ('Completado', 'Reasignada')
                        AND x.idtarea <> o.idtarea AND x.fechaprogramada = o.fechaprogramada), 0)::float8 AS horasdia,
           (SELECT count(*) FROM asignacion_tarea a JOIN tarea x ON x.idtarea = a.idtarea
             WHERE a.idempleado = fu.idusuario AND a.idfinca = $1 AND a.estado = 'Completado'
               AND lower(x.tipoactividad) = lower(o.tipoactividad)
               AND x.fechaprogramada >= current_date - 180)::int AS afinidadactividad,
           (SELECT count(*) FROM asignacion_tarea a JOIN tarea x ON x.idtarea = a.idtarea
             WHERE a.idempleado = fu.idusuario AND a.idfinca = $1 AND a.estado = 'Completado'
               AND o.idcultivo IS NOT NULL AND x.idcultivo = o.idcultivo)::int AS afinidadcultivo,
           EXISTS (SELECT 1 FROM asignacion_tarea a JOIN tarea x ON x.idtarea = a.idtarea
                    WHERE a.idempleado = fu.idusuario AND a.idfinca = $1
                      AND COALESCE(x.idtareaorigen, x.idtarea) = o.raiz AND x.idtarea <> o.idtarea
                      AND COALESCE(a.estado, '') <> 'Reasignada') AS continuidad
           FROM finca_usuario fu
           JOIN usuario u ON u.idusuario = fu.idusuario
           CROSS JOIN o
          WHERE fu.idfinca = $1 AND fu.rol = 'empleado' AND fu.activo = true
            AND NOT EXISTS (SELECT 1 FROM asignacion_tarea a
                             WHERE a.idtarea = o.idtarea AND a.idempleado = fu.idusuario
                               AND COALESCE(a.estado, '') <> 'Reasignada')`,
        [idfinca, idtarea],
      ),
    );
    return { lista, numpersonas: Number(t.numpersonas) || 1 };
  }

  /** Puntaje 0-100 y explicación en palabras para el administrador. */
  static puntuar(c: Candidato): Sugerencia {
    const motivos: string[] = [];
    let puntaje = 100;

    puntaje -= Math.min(c.horassemana * 3, 45);
    if (c.horassemana === 0) motivos.push('Sin carga esa semana');
    else motivos.push(`${Math.round(c.horassemana)} h ya asignadas esa semana`);

    if (c.horasdia >= JORNADA_HORAS) {
      puntaje -= 40;
      motivos.push('Ocupado ese día');
    } else if (c.horasdia > 0) {
      puntaje -= c.horasdia * 2;
    }

    if (c.afinidadactividad > 0) {
      puntaje += Math.min(c.afinidadactividad, 5) * 6;
      motivos.push(`Ha hecho esta labor ${c.afinidadactividad} ${c.afinidadactividad === 1 ? 'vez' : 'veces'}`);
    }
    if (c.afinidadcultivo > 0) {
      puntaje += Math.min(c.afinidadcultivo, 5) * 3;
      motivos.push('Conoce este cultivo');
    }
    if (c.continuidad) {
      puntaje += 20;
      motivos.push('Hizo la vez anterior');
    }

    return {
      idusuario: c.idusuario,
      nombre: [c.primernombre, c.primerapellido].filter(Boolean).join(' ') || `Empleado #${c.idusuario}`,
      foto: c.fotoperfil,
      puntaje: Math.max(0, Math.round(puntaje)),
      motivos,
      horassemana: c.horassemana,
    };
  }

  /** Los mejores candidatos, del más al menos conveniente. */
  async sugerir(idfinca: number, idtarea: number): Promise<{ numpersonas: number; sugerencias: Sugerencia[] }> {
    const { lista, numpersonas } = await this.candidatos(idfinca, idtarea);
    const sugerencias = lista
      .map((c) => AsignacionSugeridaService.puntuar(c))
      .sort((a, b) => b.puntaje - a.puntaje || a.horassemana - b.horassemana)
      .slice(0, Math.max(3, numpersonas));
    return { numpersonas, sugerencias };
  }

  /**
   * Asigna sin intervención: reutiliza al responsable de la ocurrencia anterior y completa con los
   * mejor puntuados hasta cubrir las personas que pide la labor. Notifica dentro de la app.
   * No asigna a quien ya esté ocupado todo el día.
   */
  async asignarAutomatico(idfinca: number, idtarea: number, idasignador: number | null): Promise<number> {
    const { lista, numpersonas } = await this.candidatos(idfinca, idtarea);
    const elegidos = lista
      .filter((c) => c.horasdia < JORNADA_HORAS)
      .map((c) => AsignacionSugeridaService.puntuar(c))
      .sort((a, b) => b.puntaje - a.puntaje)
      .slice(0, numpersonas);
    if (!elegidos.length) return 0;

    const [t] = filas<{ tipoactividad: string | null; idadmincreador: number | null }>(
      await this.ds.query(`SELECT tipoactividad, idadmincreador FROM tarea WHERE idtarea = $1 AND idfinca = $2`, [idtarea, idfinca]),
    );
    const asignador = idasignador ?? t?.idadmincreador ?? null;

    for (const e of elegidos) {
      await this.insertarAsignacion(idfinca, idtarea, e.idusuario, asignador, t?.tipoactividad ?? null);
    }
    this.logger.log(`🤖 Tarea #${idtarea} asignada automáticamente a ${elegidos.map((e) => e.nombre).join(', ')}`);
    return elegidos.length;
  }

  private async insertarAsignacion(
    idfinca: number, idtarea: number, idempleado: number, asignador: number | null, actividad: string | null,
  ) {
    await this.ds.query(
      `INSERT INTO asignacion_tarea (idfinca, idtarea, idempleado, idadminasignador, fechaasignacion, estado, origenasignacion)
       VALUES ($1, $2, $3, $4, current_date, 'Asignado', 'automatica')`,
      [idfinca, idtarea, idempleado, asignador],
    );
    await this.ds.query(
      `INSERT INTO notificacion (idfinca, idusuariodestino, titulo, mensaje, tipo, tabla_origen, idregistro)
       VALUES ($1, $2, $3, $4, 'tarea_asignada', 'tarea', $5)`,
      [idfinca, idempleado, 'Nueva tarea asignada', `Te asignaron: ${actividad ?? 'tarea'}`, idtarea],
    );
  }

  /**
   * Una nueva ocurrencia de una tarea recurrente conserva a quien la hizo la vez anterior (si sigue
   * activo). En modo `manual` no se toca nada; si nadie puede repetir y el modo es `automatica`,
   * se elige con el puntaje normal.
   */
  async asignarContinuidad(idfinca: number, idtareaAnterior: number, idtareaNueva: number): Promise<number> {
    const modo = await this.modoAsignacion(idfinca);
    if (modo === 'manual') return 0;

    const previos = filas<{ idempleado: number }>(
      await this.ds.query(
        `SELECT DISTINCT a.idempleado
           FROM asignacion_tarea a
           JOIN finca_usuario fu ON fu.idusuario = a.idempleado AND fu.idfinca = a.idfinca
                                AND fu.activo = true AND fu.rol = 'empleado'
          WHERE a.idtarea = $2 AND a.idfinca = $1 AND COALESCE(a.estado, '') <> 'Reasignada'`,
        [idfinca, idtareaAnterior],
      ),
    );
    if (previos.length) {
      const [t] = filas<{ tipoactividad: string | null; idadmincreador: number | null }>(
        await this.ds.query(`SELECT tipoactividad, idadmincreador FROM tarea WHERE idtarea = $2 AND idfinca = $1`, [idfinca, idtareaNueva]),
      );
      for (const p of previos) {
        await this.insertarAsignacion(idfinca, idtareaNueva, p.idempleado, t?.idadmincreador ?? null, t?.tipoactividad ?? null);
      }
      await this.ds.query(`UPDATE tarea SET estado = 'Asignado' WHERE idtarea = $2 AND idfinca = $1 AND estado = 'Pendiente'`, [idfinca, idtareaNueva]);
      return previos.length;
    }
    return modo === 'automatica' ? this.asignarAutomatico(idfinca, idtareaNueva, null) : 0;
  }
}
