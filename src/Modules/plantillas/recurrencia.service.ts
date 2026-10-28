import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { filas } from '../../common/sql';
import { fechaBase, hoy, sumarDias } from './fechas';
import { AsignacionSugeridaService } from '../tareas/asignacion-sugerida.service';

interface Ultima {
  idtarea: number;
  idfinca: number;
  raiz: number;
  fechaprogramada: string;
  frecuenciadias: number;
  fecharaiz: string;
  base: string | null;
  diasfin: number | null;
  fechasiembra: string | null;
  fechacosechaestimada: string | null;
}

/**
 * Tareas recurrentes: cada cadena (tarea origen + sus repeticiones) mantiene UNA ocurrencia abierta.
 * Cuando la última se completa se programa la siguiente (fecha anterior + frecuencia), hasta el
 * fin del ciclo del cultivo. Corre sin contexto de usuario: solo SQL con la finca explícita.
 */
@Injectable()
export class RecurrenciaService {
  private readonly logger = new Logger(RecurrenciaService.name);
  private corriendo = false;

  constructor(
    private readonly ds: DataSource,
    private readonly sugerida: AsignacionSugeridaService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async procesarTodas() {
    await this.procesar();
  }

  /** Programa las siguientes ocurrencias. Con `idfinca` solo procesa esa finca. Devuelve cuántas creó. */
  async procesar(idfinca?: number): Promise<number> {
    if (!this.ds.isInitialized || this.corriendo) return 0;
    this.corriendo = true;
    try {
      const ultimas = filas<Ultima>(
        await this.ds.query(
          `SELECT DISTINCT ON (raiz)
                  t.idtarea, t.idfinca, COALESCE(t.idtareaorigen, t.idtarea) AS raiz,
                  to_char(t.fechaprogramada, 'YYYY-MM-DD') AS fechaprogramada, t.frecuenciadias,
                  (SELECT to_char(r.fechaprogramada, 'YYYY-MM-DD') FROM tarea r
                    WHERE r.idtarea = COALESCE(t.idtareaorigen, t.idtarea)) AS fecharaiz,
                  p.base, p.diasfin,
                  to_char(c.fechasiembra, 'YYYY-MM-DD') AS fechasiembra,
                  to_char(c.fechacosechaestimada, 'YYYY-MM-DD') AS fechacosechaestimada
             FROM tarea t
             LEFT JOIN plantilla_labor p ON p.idplantilla = t.idplantilla
             LEFT JOIN cultivo c ON c.idcultivo = t.idcultivo
            WHERE lower(COALESCE(t.esrecurrente, '')) IN ('sí', 'si', 'true', '1')
              AND COALESCE(t.frecuenciadias, 0) > 0
              AND t.fechaprogramada IS NOT NULL
              AND ($1::int IS NULL OR t.idfinca = $1)
              AND (t.idcultivo IS NULL OR c.activo = true)
            ORDER BY raiz, t.fechaprogramada DESC, t.idtarea DESC`,
          [idfinca ?? null],
        ),
      );

      let creadas = 0;
      for (const u of ultimas) {
        try {
          if (await this.programarSiguiente(u)) creadas++;
        } catch (err) {
          this.logger.error(`Recurrencia de la tarea #${u.idtarea}: ${(err as Error).message}`);
        }
      }
      if (creadas) this.logger.log(`🔁 ${creadas} tarea(s) recurrente(s) programada(s)`);
      return creadas;
    } catch (err) {
      this.logger.warn(`procesar recurrencias: ${(err as Error).message}`);
      return 0;
    } finally {
      this.corriendo = false;
    }
  }

  private async programarSiguiente(u: Ultima): Promise<boolean> {
    // Solo se programa la siguiente cuando la última ocurrencia ya se completó (no se acumulan atrasadas)
    const [t] = filas<{ estado: string | null }>(
      await this.ds.query(`SELECT estado FROM tarea WHERE idtarea = $1 AND idfinca = $2`, [u.idtarea, u.idfinca]),
    );
    if (!t?.estado?.toLowerCase().startsWith('completad')) return false;

    const siguiente = sumarDias(u.fechaprogramada, u.frecuenciadias);
    const fin = this.fechaLimite(u);
    if (fin && siguiente > fin) return false;

    // Por si hubiera dos procesos a la vez: que no exista ya una ocurrencia abierta
    const [{ abiertas }] = filas<{ abiertas: number }>(
      await this.ds.query(
        `SELECT count(*)::int AS abiertas FROM tarea
          WHERE idfinca = $1 AND COALESCE(idtareaorigen, idtarea) = $2
            AND lower(COALESCE(estado, '')) NOT LIKE 'completad%'`,
        [u.idfinca, u.raiz],
      ),
    );
    if (abiertas) return false;

    const nueva = filas<{ idtarea: number }>(await this.ds.query(
      `INSERT INTO tarea (idfinca, tipoactividad, fechaprogramada, estado, esrecurrente, frecuenciadias,
                          costototal, costotransporte, tiempototaltarea, idadmincreador, idcultivo,
                          idplantilla, idtareaorigen, prioridad, horasestimadas, etapa, generadaauto)
       SELECT idfinca, tipoactividad, $3::date, 'Pendiente', esrecurrente, frecuenciadias,
              costototal, costotransporte, tiempototaltarea, idadmincreador, idcultivo,
              idplantilla, $2, prioridad, horasestimadas, etapa, true
         FROM tarea WHERE idtarea = $1 AND idfinca = $4
       RETURNING idtarea`,
      [u.idtarea, u.raiz, siguiente, u.idfinca],
    ));
    if (nueva[0]) await this.sugerida.asignarContinuidad(u.idfinca, u.idtarea, nueva[0].idtarea);
    return true;
  }

  /** Hasta cuándo se repite: fin de la plantilla, cosecha estimada del cultivo o, si no hay datos, un año. */
  private fechaLimite(u: Ultima): string | null {
    if (u.diasfin !== null && u.base) {
      const b = fechaBase(u.base, u);
      if (b) return sumarDias(b, u.diasfin);
    }
    if (u.fechacosechaestimada) return u.fechacosechaestimada;
    return sumarDias(u.fecharaiz ?? hoy(), 365);
  }
}
