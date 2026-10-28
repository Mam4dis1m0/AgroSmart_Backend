import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { v2 as cloudinary } from 'cloudinary';
import { filas } from '../../common/sql';
import { AuthUser } from '../../auth/tenant-context';

export interface Evidencia {
  idevidencia: number;
  idasigtarea: number | null;
  url: string;
  observaciones: string | null;
  fecha: string;
  autor: string | null;
}

/** Fotos que respaldan una tarea: se guardan en Cloudinary y quedan ligadas a la tarea para consultarlas después. */
@Injectable()
export class TareaEvidenciaService {
  private readonly logger = new Logger(TareaEvidenciaService.name);

  constructor(private readonly ds: DataSource) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  /** La tarea debe ser de la finca y, si quien consulta es empleado, estarle asignada. */
  private async acceso(idfinca: number, idtarea: number, user: AuthUser): Promise<void> {
    const [t] = await this.ds.query(`SELECT 1 FROM tarea WHERE idtarea = $1 AND idfinca = $2`, [idtarea, idfinca]);
    if (!t) throw new NotFoundException(`Tarea #${idtarea} no encontrada.`);
    if (user.rol === 'empleado') {
      const [a] = await this.ds.query(
        `SELECT 1 FROM asignacion_tarea WHERE idtarea = $1 AND idfinca = $2 AND idempleado = $3 AND COALESCE(estado, '') <> 'Reasignada'`,
        [idtarea, idfinca, user.idusuario],
      );
      if (!a) throw new ForbiddenException('Esta tarea no te fue asignada');
    }
  }

  async listar(idfinca: number, idtarea: number, user: AuthUser): Promise<Evidencia[]> {
    await this.acceso(idfinca, idtarea, user);
    return filas<Evidencia>(
      await this.ds.query(
        `SELECT e.idevidencia, e.idasigtarea, e.url, e.observaciones, e.fecha,
                NULLIF(trim(concat_ws(' ', u.primernombre, u.primerapellido)), '') AS autor
           FROM tarea_evidencia e LEFT JOIN usuario u ON u.idusuario = e.idusuario
          WHERE e.idtarea = $1 AND e.idfinca = $2
          ORDER BY e.fecha DESC, e.idevidencia DESC`,
        [idtarea, idfinca],
      ),
    );
  }

  /** Sube la foto y deja el registro. `ruta` es el archivo temporal recibido (el llamador lo borra). */
  async registrar(
    idfinca: number,
    idtarea: number,
    user: AuthUser,
    ruta: string,
    opciones: { observaciones?: string | null; idasigtarea?: number | null } = {},
  ): Promise<Evidencia> {
    await this.acceso(idfinca, idtarea, user);
    const subida = await cloudinary.uploader.upload(ruta, {
      folder: `agrosmart/evidencias/finca_${idfinca}`,
      transformation: [{ width: 1600, crop: 'limit' }],
    });
    const [e] = filas<{ idevidencia: number }>(
      await this.ds.query(
        `INSERT INTO tarea_evidencia (idfinca, idtarea, idasigtarea, idusuario, url, observaciones)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING idevidencia`,
        [idfinca, idtarea, opciones.idasigtarea ?? null, user.idusuario, subida.secure_url, opciones.observaciones?.trim() || null],
      ),
    );
    this.logger.log(`📷 Evidencia #${e.idevidencia} guardada para la tarea #${idtarea}`);
    return (await this.listar(idfinca, idtarea, user)).find((x) => x.idevidencia === e.idevidencia)!;
  }
}
