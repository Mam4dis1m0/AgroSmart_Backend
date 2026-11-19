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
//
// Sin internet (SMS) — el hilo es siempre el mismo, venga el mensaje por donde venga:
//   · Si el destinatario no tiene la app conectada, el mensaje se le reenvía por SMS desde
//     el número de AgroSmart con la etiqueta «#idhilo».
//   · Quien no tiene internet responde por SMS a ese número («#idhilo texto»); el webhook
//     (SmsWebhookController → recibirSms) lo guarda en el hilo con canal = 'SMS'.
//   · Lo que la app escribió sin conexión se sube luego con POST /sincronizar (idempotente
//     por idcliente), así ningún mensaje se pierde ni se duplica.

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
import {
  CrearHiloDto,
  EnviarAdjuntoDto,
  EnviarMensajeDto,
  ListarMensajesQueryDto,
  SincronizarMensajesDto,
} from '../../dto/mensajeria.dto';
import { MensajeriaGateway } from './mensajeria.gateway';
import { SmsService } from './sms.service';

const LIMITE_POR_DEFECTO = 50;
const PREVIEW_NOTIFICACION = 120;
const MAX_IMAGEN_BYTES = 6 * 1024 * 1024;
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_AUDIO_SEG = 120;
const MAX_SMS_RELAY = 300; // caracteres del texto reenviado por SMS (≈2 segmentos)

const COLUMNAS = `idmensaje, idremitente, tipo, contenido, adjunto_url, duracion_seg, created_at, leido_at, canal, idcliente`;

type Hilo = {
  idhilo: number;
  idcomprador: number;
  idvendedor: number;
  idfinca: number;
  titulo: string;
};

type NuevoMensaje = {
  tipo?: 'TEXTO' | 'IMAGEN' | 'AUDIO';
  contenido: string | null;
  adjuntoUrl?: string | null;
  duracionSeg?: number | null;
  canal?: 'APP' | 'SMS';
  idcliente?: string | null;
  smsSid?: string | null;
  fecha?: Date | null;
};

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
    private readonly sms: SmsService,
  ) {}

  private exigirOnline() {
    if (!this.ds.isInitialized) {
      throw new ServiceUnavailableException(
        'La mensajería requiere conexión a internet',
      );
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
      throw new BadRequestException(
        'No puedes iniciar una conversación contigo mismo',
      );
    }

    if (dto.idorden !== undefined) {
      const [orden] = await this.ds.query(
        `SELECT 1 FROM orden_compra WHERE idorden = $1 AND idlistado = $2 AND idcomprador = $3`,
        [dto.idorden, dto.idlistado, user.idusuario],
      );
      if (!orden)
        throw new BadRequestException('Esa orden no corresponde a esta oferta');
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
  private resumenHilos(
    user: AuthUser,
    idhilo: number | null,
    soloConMensajes: boolean,
  ) {
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
    return h as Hilo;
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  MENSAJES
  // ═════════════════════════════════════════════════════════════════════════

  /** Devuelve siempre en orden cronológico (el más antiguo primero). */
  async listarMensajes(
    idhilo: number,
    q: ListarMensajesQueryDto,
    user: AuthUser,
  ) {
    this.exigirOnline();
    await this.hiloDelUsuario(idhilo, user);
    const limite = q.limite ?? LIMITE_POR_DEFECTO;

    let rows: any[];
    if (q.despues !== undefined) {
      rows = await this.ds.query(
        `SELECT ${COLUMNAS}
           FROM mensaje_mercado WHERE idhilo = $1 AND idmensaje > $2
          ORDER BY idmensaje ASC LIMIT $3`,
        [idhilo, q.despues, limite],
      );
    } else {
      rows = await this.ds.query(
        `SELECT ${COLUMNAS}
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
    const destino = await this.destinoActivo(hilo, user.idusuario);

    const { row, nuevo } = await this.insertarMensaje(idhilo, user.idusuario, {
      contenido: dto.contenido,
      idcliente: dto.idcliente ?? null,
    });
    if (nuevo)
      this.difundir(hilo, row, user.idusuario, destino, dto.contenido, true);
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
    if (!archivo?.buffer?.length)
      throw new BadRequestException('Falta el archivo');

    const esAudio = dto.tipo === 'AUDIO';
    const maximo = esAudio ? MAX_AUDIO_BYTES : MAX_IMAGEN_BYTES;
    if (archivo.size > maximo) {
      throw new BadRequestException(
        `El archivo supera ${Math.round(maximo / 1024 / 1024)} MB`,
      );
    }
    if (esAudio && (dto.duracionSeg ?? 0) > MAX_AUDIO_SEG) {
      throw new BadRequestException(
        `El audio no puede durar más de ${MAX_AUDIO_SEG} segundos`,
      );
    }

    // Primero se comprueba que el usuario participa en el hilo: no se sube nada si no.
    const hilo = await this.hiloDelUsuario(idhilo, user);
    const destino = await this.destinoActivo(hilo, user.idusuario);

    const url = await this.subirArchivo(archivo.buffer, esAudio);
    const { row } = await this.insertarMensaje(idhilo, user.idusuario, {
      tipo: dto.tipo,
      contenido: dto.contenido || null,
      adjuntoUrl: url,
      duracionSeg: esAudio ? (dto.duracionSeg ?? null) : null,
    });

    const vista = dto.contenido || (esAudio ? '🎤 Audio' : '📷 Foto');
    this.difundir(
      hilo,
      row,
      user.idusuario,
      destino,
      `${vista} (ábrelo en la app)`,
      true,
      vista,
    );
    return this.mapMensaje(row, user.idusuario);
  }

  /** Sube el archivo a Cloudinary (el audio se guarda como "video", así lo clasifica Cloudinary). */
  private async subirArchivo(
    buffer: Buffer,
    esAudio: boolean,
  ): Promise<string> {
    try {
      return await new Promise<string>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'agrosmart/chat',
            resource_type: esAudio ? 'video' : 'image',
            allowed_formats: esAudio
              ? ['m4a', 'aac', 'mp3', 'ogg', 'wav', 'webm', 'mp4', '3gp']
              : ['jpg', 'jpeg', 'png', 'webp', 'heic'],
            ...(esAudio
              ? {}
              : {
                  transformation: [
                    { width: 1600, crop: 'limit', quality: 'auto' },
                  ],
                }),
          },
          (err, res) =>
            err || !res
              ? reject(err ?? new Error('Sin respuesta de Cloudinary'))
              : resolve(res.secure_url),
        );
        stream.end(buffer);
      });
    } catch (err) {
      this.logger.warn(`Fallo al subir adjunto: ${(err as Error).message}`);
      throw new BadRequestException(
        'No se pudo procesar el archivo. Verifica que sea una foto o un audio válido.',
      );
    }
  }

  async marcarLeidos(idhilo: number, user: AuthUser) {
    this.exigirOnline();
    const hilo = await this.hiloDelUsuario(idhilo, user);
    const otro =
      hilo.idcomprador === user.idusuario ? hilo.idvendedor : hilo.idcomprador;

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
      this.gateway.emitirAUsuario(otro, 'mensaje:leido', {
        idhilo,
        hasta,
        por: user.idusuario,
      });
    }
    await this.ds
      .query(
        `UPDATE notificacion SET leida = true
          WHERE tipo = 'MENSAJE_MERCADO' AND idregistro = $1 AND idusuariodestino = $2 AND leida = false`,
        [idhilo, user.idusuario],
      )
      .catch((err) =>
        this.logger.warn(`No se pudo limpiar la notificación: ${err.message}`),
      );

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
  //  SIN INTERNET (SMS)
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Sube los mensajes escritos sin conexión. Cada uno se procesa por separado: un hilo
   * inválido no impide guardar los demás. Repetir la misma llamada no duplica nada.
   */
  async sincronizar(dto: SincronizarMensajesDto, user: AuthUser) {
    this.exigirOnline();
    const hilos = new Map<number, { hilo: Hilo; destino: number } | Error>();
    const resultados: Array<{
      idcliente: string;
      estado: 'NUEVO' | 'DUPLICADO' | 'RECHAZADO';
      mensaje?: ReturnType<MensajeriaService['mapMensaje']>;
      error?: string;
    }> = [];

    for (const m of dto.mensajes) {
      try {
        if (!hilos.has(m.idhilo)) {
          try {
            const hilo = await this.hiloDelUsuario(m.idhilo, user);
            hilos.set(m.idhilo, {
              hilo,
              destino: await this.destinoActivo(hilo, user.idusuario),
            });
          } catch (err) {
            hilos.set(m.idhilo, err as Error);
          }
        }
        const h = hilos.get(m.idhilo)!;
        if (h instanceof Error) throw h;

        const { row, nuevo } = await this.insertarMensaje(
          m.idhilo,
          user.idusuario,
          {
            contenido: m.contenido,
            canal: m.canal,
            idcliente: m.idcliente,
            fecha: new Date(m.fecha),
          },
        );
        // Si salió por SMS nativo, el otro ya lo recibió en su teléfono: no se reenvía.
        if (nuevo)
          this.difundir(
            h.hilo,
            row,
            user.idusuario,
            h.destino,
            m.contenido,
            m.canal === 'APP',
          );
        resultados.push({
          idcliente: m.idcliente,
          estado: nuevo ? 'NUEVO' : 'DUPLICADO',
          mensaje: this.mapMensaje(row, user.idusuario),
        });
      } catch (err) {
        resultados.push({
          idcliente: m.idcliente,
          estado: 'RECHAZADO',
          error: (err as Error).message,
        });
      }
    }

    const contar = (e: string) =>
      resultados.filter((r) => r.estado === e).length;
    return {
      recibidos: dto.mensajes.length,
      nuevos: contar('NUEVO'),
      duplicados: contar('DUPLICADO'),
      rechazados: contar('RECHAZADO'),
      resultados,
    };
  }

  infoSms() {
    return {
      disponible: this.sms.configurado,
      numero: this.sms.numeroAgroSmart,
      formato: '#<idhilo> tu mensaje',
      ejemplo: '#42 ¿Todavía tiene disponible el café?',
    };
  }

  /**
   * SMS entrante (webhook de Twilio). Devuelve el texto a responder al remitente por SMS,
   * o null si no hay que responder nada. Nunca lanza: Twilio reintentaría.
   */
  async recibirSms(
    from: string | undefined,
    cuerpo: string | undefined,
    sid: string | undefined,
  ): Promise<string | null> {
    try {
      if (!this.ds.isInitialized)
        return 'AgroSmart no está disponible en este momento. Intenta más tarde.';
      const clave = SmsService.clave(from);
      if (!clave) return null;

      const usuarios = await this.ds.query(
        `SELECT idusuario FROM usuario
          WHERE right(regexp_replace(telefono, '\\D', '', 'g'), 10) = $1 AND activo IS DISTINCT FROM false
          LIMIT 2`,
        [clave],
      );
      if (usuarios.length === 0)
        return 'Este número no está registrado en AgroSmart. Agrégalo a tu perfil en la app.';
      if (usuarios.length > 1)
        return 'Este número está en varias cuentas de AgroSmart. Escríbenos desde la app.';
      const idusuario: number = usuarios[0].idusuario;

      const texto = String(cuerpo ?? '').trim();
      const etiqueta = /^#(\d+)\s*([\s\S]*)$/.exec(texto);
      const contenido = (etiqueta ? etiqueta[2] : texto).trim().slice(0, 2000);

      const [h] = await this.ds.query(
        `SELECT h.idhilo, h.idcomprador, h.idvendedor, l.idfinca, l.titulo
           FROM hilo_mercado h JOIN listado l ON l.idlistado = h.idlistado
          WHERE (h.idcomprador = $1 OR h.idvendedor = $1)
            AND ($2::int IS NULL OR h.idhilo = $2::int)
          ORDER BY h.ultimo_mensaje_at DESC NULLS LAST, h.idhilo DESC
          LIMIT 1`,
        [idusuario, etiqueta ? Number(etiqueta[1]) : null],
      );
      if (!h) {
        return etiqueta
          ? `No encontramos la conversación #${etiqueta[1]}. Revisa el número que aparece en los SMS de AgroSmart.`
          : 'No tienes conversaciones en AgroSmart. Ábrelas desde el Marketplace en la app.';
      }
      if (!contenido) return `Escribe tu mensaje así: #${h.idhilo} tu mensaje`;

      const hilo = h as Hilo;
      let destino: number;
      try {
        destino = await this.destinoActivo(hilo, idusuario);
      } catch {
        return 'La otra persona ya no está disponible en AgroSmart.';
      }

      const { row, nuevo } = await this.insertarMensaje(
        hilo.idhilo,
        idusuario,
        {
          contenido,
          canal: 'SMS',
          smsSid: sid ?? null,
        },
      );
      if (nuevo) this.difundir(hilo, row, idusuario, destino, contenido, true);
      return null;
    } catch (err) {
      this.logger.error(
        `Error procesando SMS entrante: ${(err as Error).message}`,
      );
      return 'No pudimos entregar tu mensaje. Intenta de nuevo en unos minutos.';
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  Internos
  // ═════════════════════════════════════════════════════════════════════════

  /** Id del otro participante; lanza 409 si su cuenta ya no está activa. */
  private async destinoActivo(hilo: Hilo, yo: number): Promise<number> {
    const destino =
      hilo.idcomprador === yo ? hilo.idvendedor : hilo.idcomprador;
    const [dest] = await this.ds.query(
      `SELECT activo FROM usuario WHERE idusuario = $1`,
      [destino],
    );
    if (!dest || dest.activo === false) {
      throw new ConflictException(
        'La otra persona ya no está disponible en la plataforma',
      );
    }
    return destino;
  }

  /**
   * Guarda el mensaje y avanza el hilo en una sola sentencia. Si idcliente o sms_sid ya
   * existían (reintento), no inserta nada y devuelve el mensaje original con nuevo = false.
   * La fecha del cliente (mensajes offline) se respeta, pero nunca puede quedar en el futuro.
   */
  private async insertarMensaje(
    idhilo: number,
    idremitente: number,
    m: NuevoMensaje,
  ): Promise<{ row: any; nuevo: boolean }> {
    const [row] = filas(
      await this.ds.query(
        `WITH nuevo AS (
           INSERT INTO mensaje_mercado (idhilo, idremitente, tipo, contenido, adjunto_url, duracion_seg, canal, idcliente, sms_sid, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, LEAST(COALESCE($10::timestamptz, now()), now()))
           ON CONFLICT DO NOTHING
           RETURNING ${COLUMNAS}, idhilo
         ), avance AS (
           UPDATE hilo_mercado h
              SET ultimo_mensaje_at = GREATEST(COALESCE(h.ultimo_mensaje_at, nuevo.created_at), nuevo.created_at)
             FROM nuevo WHERE h.idhilo = nuevo.idhilo
         )
         SELECT ${COLUMNAS} FROM nuevo`,
        [
          idhilo,
          idremitente,
          m.tipo ?? 'TEXTO',
          m.contenido,
          m.adjuntoUrl ?? null,
          m.duracionSeg ?? null,
          m.canal ?? 'APP',
          m.idcliente ?? null,
          m.smsSid ?? null,
          m.fecha ? m.fecha.toISOString() : null,
        ],
      ),
    );
    if (row) return { row, nuevo: true };

    // Reintento: se devuelve el original (puede estar en otro hilo si el cliente reutilizó el id)
    const [existente] = await this.ds.query(
      `SELECT ${COLUMNAS}, idhilo FROM mensaje_mercado
        WHERE (idremitente = $1 AND idcliente = $2) OR sms_sid = $3
        LIMIT 1`,
      [idremitente, m.idcliente ?? null, m.smsSid ?? null],
    );
    if (!existente || existente.idhilo !== idhilo) {
      throw new ConflictException(
        'Ese idcliente ya se usó en otra conversación',
      );
    }
    return { row: existente, nuevo: false };
  }

  /**
   * Socket.IO a ambos, notificación en la app y, si el destinatario no tiene la app
   * conectada, copia por SMS desde el número de AgroSmart.
   */
  private difundir(
    hilo: Hilo,
    row: any,
    remitente: number,
    destino: number,
    textoSms: string,
    reenviarPorSms: boolean,
    vistaNotificacion?: string,
  ): void {
    for (const id of [remitente, destino]) {
      this.gateway.emitirAUsuario(id, 'mensaje:nuevo', {
        idhilo: hilo.idhilo,
        mensaje: this.mapMensaje(row, id),
      });
    }
    void this.notificar(
      hilo,
      destino,
      remitente,
      vistaNotificacion ?? textoSms,
    );
    if (reenviarPorSms && !this.gateway.estaConectado(destino)) {
      void this.reenviarPorSms(
        hilo,
        Number(row.idmensaje),
        remitente,
        destino,
        textoSms,
      );
    }
  }

  private async reenviarPorSms(
    hilo: Hilo,
    idmensaje: number,
    remitente: number,
    destino: number,
    texto: string,
  ): Promise<void> {
    if (!this.sms.configurado) return;
    try {
      const [d] = await this.ds.query(
        `SELECT telefono FROM usuario WHERE idusuario = $1`,
        [destino],
      );
      if (!d?.telefono) return;
      const nombre = await this.nombreDe(remitente);
      const cuerpo =
        texto.length > MAX_SMS_RELAY
          ? `${texto.slice(0, MAX_SMS_RELAY)}…`
          : texto;
      const sms =
        `AgroSmart #${hilo.idhilo} · ${nombre} («${hilo.titulo}»): ${cuerpo}\n` +
        `Responde a este número: #${hilo.idhilo} tu mensaje`;
      if (await this.sms.enviar(d.telefono, sms)) {
        await this.ds.query(
          `UPDATE mensaje_mercado SET sms_relay_at = now() WHERE idmensaje = $1`,
          [idmensaje],
        );
      }
    } catch (err) {
      this.logger.warn(
        `No se pudo reenviar por SMS: ${(err as Error).message}`,
      );
    }
  }

  private async nombreDe(idusuario: number): Promise<string> {
    const [u] = await this.ds.query(
      `SELECT NULLIF(trim(concat_ws(' ', primernombre, primerapellido)), '') AS nombre FROM usuario WHERE idusuario = $1`,
      [idusuario],
    );
    return u?.nombre ?? 'Alguien';
  }

  /**
   * Una notificación por hilo mientras haya mensajes sin leer: no se crea una por cada
   * mensaje (evita llenar la bandeja). Nunca debe romper el envío.
   */
  private async notificar(
    hilo: Hilo,
    destino: number,
    remitente: number,
    contenido: string,
  ): Promise<void> {
    try {
      const nombre = await this.nombreDe(remitente);
      const preview =
        contenido.length > PREVIEW_NOTIFICACION
          ? `${contenido.slice(0, PREVIEW_NOTIFICACION)}…`
          : contenido;
      // El vendedor ve la notificación dentro de su finca; el comprador no tiene finca
      const idfinca = destino === hilo.idvendedor ? hilo.idfinca : null;

      await this.ds.query(
        `INSERT INTO notificacion (mensaje, tipo, tabla_origen, idregistro, idusuariodestino, titulo, idfinca)
         SELECT $1::text, 'MENSAJE_MERCADO', 'hilo_mercado', $2::int, $3::int, $4::text, $5::int
          WHERE NOT EXISTS (SELECT 1 FROM notificacion
                             WHERE tipo = 'MENSAJE_MERCADO' AND idregistro = $2::int
                               AND idusuariodestino = $3::int AND leida = false)`,
        [
          `${nombre} sobre «${hilo.titulo}»: ${preview}`,
          hilo.idhilo,
          destino,
          'Nuevo mensaje',
          idfinca,
        ],
      );
    } catch (err) {
      this.logger.warn(
        `No se pudo crear la notificación del mensaje: ${(err as Error).message}`,
      );
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
      canal: (r.canal ?? 'APP') as 'APP' | 'SMS',
      idcliente: (r.idcliente ?? null) as string | null,
    };
  }
}
