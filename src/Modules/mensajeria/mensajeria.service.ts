// src/Modules/mensajeria/mensajeria.service.ts
//
// Mensajería comprador ↔ vendedor del Marketplace.
//
//   · Un hilo = UN comprador + el vendedor de UNA oferta (idlistado, idcomprador únicos).
//   · Solo el comprador abre el hilo (el catálogo oculta idvendedor a propósito: el vendedor
//     se resuelve en el servidor a partir del id de la oferta, nunca lo manda el cliente).
//   · Solo los dos participantes ven o escriben en el hilo. Un tercero recibe 404, no 403,
//     para no revelar que el hilo existe.
//   · Al enviar: se guarda, se empuja por Socket.IO a ambos y se crea una notificación.

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { DataSource } from 'typeorm';
import { PlanService } from '../../auth/plan.service';
import { AuthUser } from '../../auth/tenant-context';
import { filas } from '../../common/sql';
import { CrearHiloDto, EnviarAdjuntoDto, EnviarMensajeDto, ListarMensajesQueryDto } from '../../dto/mensajeria.dto';
import { MensajeriaGateway } from './mensajeria.gateway';

const LIMITE_POR_DEFECTO = 50;
const PREVIEW_NOTIFICACION = 120;
const MAX_IMAGEN_BYTES = 6 * 1024 * 1024;
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_AUDIO_SEG = 120;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

@Injectable()
export class MensajeriaService {
  private readonly logger = new Logger(MensajeriaService.name);

  constructor(
    private readonly ds: DataSource,
    private readonly planes: PlanService,
    private readonly gateway: MensajeriaGateway,
  ) {}

  private exigirOnline() {
    if (!this.ds.isInitialized) {
      throw new ServiceUnavailableException('La mensajería requiere conexión a internet');
    }
  }

  /** Mismo criterio que el catálogo: el acceso anticipado es solo para fincas Premium. */
  private async esPremium(user: AuthUser): Promise<boolean> {
    if (user.rol === 'comprador' || user.idfinca === null) return false;
    return this.planes.tieneFuncion(user.idfinca, 'early_access');
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  HILOS
  // ═════════════════════════════════════════════════════════════════════════

  /** «Chatear con el vendedor»: crea el hilo o devuelve el existente (idempotente). */
  async abrirHilo(dto: CrearHiloDto, user: AuthUser) {
    this.exigirOnline();
    const premium = await this.esPremium(user);

    // Solo se puede escribir sobre ofertas que el usuario puede ver en el catálogo,
    // o sobre una oferta en la que ya tiene una orden (aunque luego se haya pausado).
    const [l] = await this.ds.query(
      `SELECT l.idlistado, l.idvendedor
         FROM listado l
        WHERE l.idlistado = $1
          AND ( (l.estado = 'PUBLICADO'
                 AND (l.earlyaccesshasta IS NULL OR l.earlyaccesshasta <= now() OR $2::boolean OR l.idfinca = $3::int))
                OR EXISTS (SELECT 1 FROM orden_compra o WHERE o.idlistado = l.idlistado AND o.idcomprador = $4::int) )`,
      [dto.idlistado, premium, user.idfinca, user.idusuario],
    );
    if (!l) throw new NotFoundException('El producto no está disponible');
    if (l.idvendedor === user.idusuario) {
      throw new BadRequestException('No puedes iniciar una conversación contigo mismo');
    }

    if (dto.idorden !== undefined) {
      const [orden] = await this.ds.query(
        `SELECT 1 FROM orden_compra WHERE idorden = $1 AND idlistado = $2 AND idcomprador = $3`,
        [dto.idorden, dto.idlistado, user.idusuario],
      );
      if (!orden) throw new BadRequestException('Esa orden no corresponde a esta oferta');
    }

    // Idempotente: si ya existía, solo enlaza la orden en caso de que aún no tuviera una
    const [hilo] = filas(
      await this.ds.query(
        `INSERT INTO hilo_mercado (idlistado, idcomprador, idvendedor, idorden)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (idlistado, idcomprador)
         DO UPDATE SET idorden = COALESCE(hilo_mercado.idorden, EXCLUDED.idorden)
         RETURNING idhilo`,
        [dto.idlistado, user.idusuario, l.idvendedor, dto.idorden ?? null],
      ),
    );
    return this.detalleHilo(hilo.idhilo, user);
  }

  /** Bandeja de chats: solo hilos con mensajes, el más reciente primero. */
  async listarHilos(user: AuthUser) {
    this.exigirOnline();
    return this.resumenHilos(user, null, true);
  }

  async detalleHilo(idhilo: number, user: AuthUser) {
    this.exigirOnline();
    const [hilo] = await this.resumenHilos(user, idhilo, false);
    if (!hilo) throw new NotFoundException('Conversación no encontrada');
    return hilo;
  }

  /**
   * Una sola consulta para la bandeja (idhilo = null) y para el detalle de un hilo.
   * Nunca expone correo ni cédula de la otra persona. Sí devuelve su foto de perfil (otroFoto).
   * El teléfono SOLO se devuelve en el detalle de un hilo (idhilo != null): lo usa la app
   * para enviar mensajes por SMS cuando no hay internet.
   */
  private resumenHilos(user: AuthUser, idhilo: number | null, soloConMensajes: boolean) {
    return this.ds.query(
      `SELECT h.idhilo, h.idlistado, h.idorden, h.ultimo_mensaje_at AS "ultimoMensajeAt",
              CASE WHEN h.idcomprador = $1 THEN 'comprador' ELSE 'vendedor' END AS "miRol",
              l.titulo, l.estado AS "estadoListado",
              l.preciounitario::float8 AS precio, l.unidad, l.moneda,
              (SELECT f.url FROM listado_foto f WHERE f.idlistado = l.idlistado ORDER BY f.orden, f.idfoto LIMIT 1) AS foto,
              o.estado AS "estadoOrden",
              u.idusuario AS "otroId",
              NULLIF(trim(concat_ws(' ', u.primernombre, u.primerapellido)), '') AS "otroNombre",
              u.fotoperfil AS "otroFoto",
              CASE WHEN $2::int IS NOT NULL THEN u.telefono END AS "otroTelefono",
              COALESCE(lm.contenido, CASE lm.tipo WHEN 'IMAGEN' THEN '📷 Foto' WHEN 'AUDIO' THEN '🎤 Audio' END) AS "ultimoContenido",
              lm.idremitente AS "ultimoRemitente",
              (SELECT COUNT(*)::int FROM mensaje_mercado m
                WHERE m.idhilo = h.idhilo AND m.idremitente <> $1 AND m.leido_at IS NULL) AS "noLeidos"
         FROM hilo_mercado h
         JOIN listado l ON l.idlistado = h.idlistado
         JOIN usuario u ON u.idusuario = CASE WHEN h.idcomprador = $1 THEN h.idvendedor ELSE h.idcomprador END
         LEFT JOIN orden_compra o ON o.idorden = h.idorden
         LEFT JOIN LATERAL (SELECT contenido, tipo, idremitente FROM mensaje_mercado
                             WHERE idhilo = h.idhilo ORDER BY idmensaje DESC LIMIT 1) lm ON true
        WHERE (h.idcomprador = $1 OR h.idvendedor = $1)
          AND ($2::int IS NULL OR h.idhilo = $2::int)
          AND ($3::boolean = false OR h.ultimo_mensaje_at IS NOT NULL)
        ORDER BY h.ultimo_mensaje_at DESC NULLS LAST, h.idhilo DESC`,
      [user.idusuario, idhilo, soloConMensajes],
    );
  }

  /** Devuelve el hilo solo si el usuario es participante; si no, 404. */
  private async hiloDelUsuario(idhilo: number, user: AuthUser) {
    const [h] = await this.ds.query(
      `SELECT h.idhilo, h.idcomprador, h.idvendedor, l.idfinca, l.titulo
         FROM hilo_mercado h JOIN listado l ON l.idlistado = h.idlistado
        WHERE h.idhilo = $1 AND (h.idcomprador = $2 OR h.idvendedor = $2)`,
      [idhilo, user.idusuario],
    );
    if (!h) throw new NotFoundException('Conversación no encontrada');
    return h as { idhilo: number; idcomprador: number; idvendedor: number; idfinca: number; titulo: string };
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  MENSAJES
  // ═════════════════════════════════════════════════════════════════════════

  /** Devuelve siempre en orden cronológico (el más antiguo primero). */
  async listarMensajes(idhilo: number, q: ListarMensajesQueryDto, user: AuthUser) {
    this.exigirOnline();
    await this.hiloDelUsuario(idhilo, user);
    const limite = q.limite ?? LIMITE_POR_DEFECTO;

    let rows: any[];
    if (q.despues !== undefined) {
      rows = await this.ds.query(
        `SELECT idmensaje, idremitente, tipo, contenido, adjunto_url, duracion_seg, created_at, leido_at
           FROM mensaje_mercado WHERE idhilo = $1 AND idmensaje > $2
          ORDER BY idmensaje ASC LIMIT $3`,
        [idhilo, q.despues, limite],
      );
    } else {
      rows = await this.ds.query(
        `SELECT idmensaje, idremitente, tipo, contenido, adjunto_url, duracion_seg, created_at, leido_at
           FROM mensaje_mercado WHERE idhilo = $1 AND ($2::bigint IS NULL OR idmensaje < $2::bigint)
          ORDER BY idmensaje DESC LIMIT $3`,
        [idhilo, q.antes ?? null, limite],
      );
      rows.reverse();
    }
    return rows.map((r) => this.mapMensaje(r, user.idusuario));
  }

  async enviar(idhilo: number, dto: EnviarMensajeDto, user: AuthUser) {
    this.exigirOnline();
    const hilo = await this.hiloDelUsuario(idhilo, user);
    const destino = hilo.idcomprador === user.idusuario ? hilo.idvendedor : hilo.idcomprador;

    const [dest] = await this.ds.query(`SELECT activo FROM usuario WHERE idusuario = $1`, [destino]);
    if (!dest || dest.activo === false) {
      throw new ConflictException('La otra persona ya no está disponible en la plataforma');
    }

    // Guardar mensaje y avanzar el hilo en una sola sentencia (atómica)
    const [row] = filas(
      await this.ds.query(
        `WITH nuevo AS (
           INSERT INTO mensaje_mercado (idhilo, idremitente, contenido)
           VALUES ($1, $2, $3)
           RETURNING idmensaje, idremitente, tipo, contenido, adjunto_url, duracion_seg, created_at, leido_at, idhilo
         )
         UPDATE hilo_mercado h SET ultimo_mensaje_at = nuevo.created_at
           FROM nuevo WHERE h.idhilo = nuevo.idhilo
         RETURNING nuevo.idmensaje, nuevo.idremitente, nuevo.tipo, nuevo.contenido, nuevo.adjunto_url, nuevo.duracion_seg, nuevo.created_at, nuevo.leido_at`,
        [idhilo, user.idusuario, dto.contenido],
      ),
    );

    // Push a ambos (el emisor puede tener la app abierta en otro dispositivo)
    for (const id of [user.idusuario, destino]) {
      this.gateway.emitirAUsuario(id, 'mensaje:nuevo', { idhilo, mensaje: this.mapMensaje(row, id) });
    }
    void this.notificar(hilo, destino, user, dto.contenido);

    return this.mapMensaje(row, user.idusuario);
  }

  /**
   * Foto o audio. El archivo se valida (tamaño/duración), se sube a Cloudinary y se guarda
   * el enlace; luego se empuja por Socket.IO igual que un mensaje de texto.
   */
  async enviarAdjunto(
    idhilo: number,
    archivo: Express.Multer.File | undefined,
    dto: EnviarAdjuntoDto,
    user: AuthUser,
  ) {
    this.exigirOnline();
    if (!archivo?.buffer?.length) throw new BadRequestException('Falta el archivo');

    const esAudio = dto.tipo === 'AUDIO';
    const maximo = esAudio ? MAX_AUDIO_BYTES : MAX_IMAGEN_BYTES;
    if (archivo.size > maximo) {
      throw new BadRequestException(`El archivo supera ${Math.round(maximo / 1024 / 1024)} MB`);
    }
    if (esAudio && (dto.duracionSeg ?? 0) > MAX_AUDIO_SEG) {
      throw new BadRequestException(`El audio no puede durar más de ${MAX_AUDIO_SEG} segundos`);
    }

    // Primero se comprueba que el usuario participa en el hilo: no se sube nada si no.
    const hilo = await this.hiloDelUsuario(idhilo, user);
    const destino = hilo.idcomprador === user.idusuario ? hilo.idvendedor : hilo.idcomprador;
    const [dest] = await this.ds.query(`SELECT activo FROM usuario WHERE idusuario = $1`, [destino]);
    if (!dest || dest.activo === false) {
      throw new ConflictException('La otra persona ya no está disponible en la plataforma');
    }

    const url = await this.subirArchivo(archivo.buffer, esAudio);

    const [row] = filas(
      await this.ds.query(
        `WITH nuevo AS (
           INSERT INTO mensaje_mercado (idhilo, idremitente, tipo, contenido, adjunto_url, duracion_seg)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING idmensaje, idremitente, tipo, contenido, adjunto_url, duracion_seg, created_at, leido_at, idhilo
         )
         UPDATE hilo_mercado h SET ultimo_mensaje_at = nuevo.created_at
           FROM nuevo WHERE h.idhilo = nuevo.idhilo
         RETURNING nuevo.idmensaje, nuevo.idremitente, nuevo.tipo, nuevo.contenido, nuevo.adjunto_url, nuevo.duracion_seg, nuevo.created_at, nuevo.leido_at`,
        [idhilo, user.idusuario, dto.tipo, dto.contenido || null, url, esAudio ? (dto.duracionSeg ?? null) : null],
      ),
    );

    for (const id of [user.idusuario, destino]) {
      this.gateway.emitirAUsuario(id, 'mensaje:nuevo', { idhilo, mensaje: this.mapMensaje(row, id) });
    }
    const vista = dto.contenido || (esAudio ? '🎤 Audio' : '📷 Foto');
    void this.notificar(hilo, destino, user, vista);

    return this.mapMensaje(row, user.idusuario);
  }

  /** Sube el archivo a Cloudinary (el audio se guarda como "video", así lo clasifica Cloudinary). */
  private async subirArchivo(buffer: Buffer, esAudio: boolean): Promise<string> {
    try {
      return await new Promise<string>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'agrosmart/chat',
            resource_type: esAudio ? 'video' : 'image',
            allowed_formats: esAudio
              ? ['m4a', 'aac', 'mp3', 'ogg', 'wav', 'webm', 'mp4', '3gp']
              : ['jpg', 'jpeg', 'png', 'webp', 'heic'],
            ...(esAudio ? {} : { transformation: [{ width: 1600, crop: 'limit', quality: 'auto' }] }),
          },
          (err, res) => (err || !res ? reject(err ?? new Error('Sin respuesta de Cloudinary')) : resolve(res.secure_url)),
        );
        stream.end(buffer);
      });
    } catch (err) {
      this.logger.warn(`Fallo al subir adjunto: ${(err as Error).message}`);
      throw new BadRequestException('No se pudo procesar el archivo. Verifica que sea una foto o un audio válido.');
    }
  }

  async marcarLeidos(idhilo: number, user: AuthUser) {
    this.exigirOnline();
    const hilo = await this.hiloDelUsuario(idhilo, user);
    const otro = hilo.idcomprador === user.idusuario ? hilo.idvendedor : hilo.idcomprador;

    const leidos = filas<{ idmensaje: string }>(
      await this.ds.query(
        `UPDATE mensaje_mercado SET leido_at = now()
          WHERE idhilo = $1 AND idremitente <> $2 AND leido_at IS NULL
          RETURNING idmensaje`,
        [idhilo, user.idusuario],
      ),
    );

    if (leidos.length > 0) {
      const hasta = Math.max(...leidos.map((r) => Number(r.idmensaje)));
      this.gateway.emitirAUsuario(otro, 'mensaje:leido', { idhilo, hasta, por: user.idusuario });
    }
    await this.ds
      .query(
        `UPDATE notificacion SET leida = true
          WHERE tipo = 'MENSAJE_MERCADO' AND idregistro = $1 AND idusuariodestino = $2 AND leida = false`,
        [idhilo, user.idusuario],
      )
      .catch((err) => this.logger.warn(`No se pudo limpiar la notificación: ${err.message}`));

    return { marcados: leidos.length };
  }

  /** Total de mensajes sin leer (insignia de la pestaña «Chats»). */
  async noLeidosTotal(user: AuthUser) {
    this.exigirOnline();
    const [r] = await this.ds.query(
      `SELECT COUNT(*)::int AS total
         FROM mensaje_mercado m JOIN hilo_mercado h ON h.idhilo = m.idhilo
        WHERE (h.idcomprador = $1 OR h.idvendedor = $1) AND m.idremitente <> $1 AND m.leido_at IS NULL`,
      [user.idusuario],
    );
    return { total: r?.total ?? 0 };
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  Internos
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Una notificación por hilo mientras haya mensajes sin leer: no se crea una por cada
   * mensaje (evita llenar la bandeja). Nunca debe romper el envío.
   */
  private async notificar(
    hilo: { idhilo: number; idvendedor: number; idfinca: number; titulo: string },
    destino: number,
    remitente: AuthUser,
    contenido: string,
  ): Promise<void> {
    try {
      const [u] = await this.ds.query(
        `SELECT NULLIF(trim(concat_ws(' ', primernombre, primerapellido)), '') AS nombre FROM usuario WHERE idusuario = $1`,
        [remitente.idusuario],
      );
      const nombre = u?.nombre ?? 'Alguien';
      const preview = contenido.length > PREVIEW_NOTIFICACION ? `${contenido.slice(0, PREVIEW_NOTIFICACION)}…` : contenido;
      // El vendedor ve la notificación dentro de su finca; el comprador no tiene finca
      const idfinca = destino === hilo.idvendedor ? hilo.idfinca : null;

      await this.ds.query(
        `INSERT INTO notificacion (mensaje, tipo, tabla_origen, idregistro, idusuariodestino, titulo, idfinca)
         SELECT $1::text, 'MENSAJE_MERCADO', 'hilo_mercado', $2::int, $3::int, $4::text, $5::int
          WHERE NOT EXISTS (SELECT 1 FROM notificacion
                             WHERE tipo = 'MENSAJE_MERCADO' AND idregistro = $2::int
                               AND idusuariodestino = $3::int AND leida = false)`,
        [`${nombre} sobre «${hilo.titulo}»: ${preview}`, hilo.idhilo, destino, 'Nuevo mensaje', idfinca],
      );
    } catch (err) {
      this.logger.warn(`No se pudo crear la notificación del mensaje: ${(err as Error).message}`);
    }
  }

  /** idmensaje es bigint → pg lo entrega como string; se normaliza a número. */
  private mapMensaje(r: any, yo: number) {
    return {
      idmensaje: Number(r.idmensaje),
      idremitente: r.idremitente,
      mio: r.idremitente === yo,
      tipo: r.tipo ?? 'TEXTO',
      contenido: r.contenido,
      adjuntoUrl: r.adjunto_url ?? null,
      duracionSeg: r.duracion_seg ?? null,
      createdAt: r.created_at,
      leidoAt: r.leido_at,
    };
  }
}
