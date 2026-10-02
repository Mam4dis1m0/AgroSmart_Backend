// src/Modules/marketplace/marketplace.service.ts
//
// Marketplace "MarketFields" (EP-09): el productor publica excedentes de cosecha y los
// compradores locales los encuentran, ordenan y coordinan la entrega.
//
//   Vendedor  = administrador de una finca (rol admin, con finca activa)
//   Comprador = registro simple (rol comprador, SIN acceso a datos internos de ninguna finca: RNF-20)
//
// El catálogo solo expone datos públicos (nunca idfinca/idvendedor ni cifras internas).
// Las operaciones del Marketplace requieren conexión (el borrador offline de CU-29 queda pendiente).

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { v2 as cloudinary } from 'cloudinary';
import { Listado } from '../../Entidades/entities/Listado';
import { ListadoFoto } from '../../Entidades/entities/ListadoFoto';
import {
  CarritoItemDto,
  CatalogoQueryDto,
  CreateListadoDto,
  CreateOrdenDto,
  UpdateListadoDto,
} from '../../dto/marketplace.dto';
import { PlanService } from '../../auth/plan.service';
import { AuthUser } from '../../auth/tenant-context';
import { filas } from '../../common/sql';
import { PasarelaPagoService } from '../suscripciones/pasarela-pago.service';

// AJUSTAR: valores de negocio de ejemplo
const EARLY_ACCESS_HORAS = 24;       // Premium publica y ve productos antes (RF-43)
const DESTACADO_PRECIO = 9900;       // COP, listado destacado (RF-32)
const DESTACADO_DIAS = 7;

const redondear = (n: number) => Math.round(n * 100) / 100;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(
    private readonly ds: DataSource,
    private readonly planes: PlanService,
    private readonly pasarela: PasarelaPagoService,
  ) {}

  private exigirOnline() {
    if (!this.ds.isInitialized) {
      throw new ServiceUnavailableException('El Marketplace requiere conexión a internet');
    }
  }

  /** ¿Quien consulta tiene Premium? (finca con acceso anticipado). Los compradores no. */
  private async esPremium(user: AuthUser): Promise<boolean> {
    if (user.rol === 'comprador' || user.idfinca === null) return false;
    return this.planes.tieneFuncion(user.idfinca, 'early_access');
  }

  /** Carrito/wishlist: compradores siempre; administradores solo con Premium (CU-46). */
  private async exigirCarrito(user: AuthUser): Promise<void> {
    if (user.rol === 'comprador') return;
    if (user.rol === 'admin' && user.idfinca !== null &&
        (await this.planes.tieneFuncion(user.idfinca, 'marketplace_premium'))) return;
    throw new ForbiddenException({
      statusCode: 403,
      code: 'PLAN_PREMIUM_REQUERIDO',
      message: 'El carrito y las listas de deseos son una función Premium.',
      funcion: 'marketplace_premium',
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  CATÁLOGO PÚBLICO (CU-30)
  // ═════════════════════════════════════════════════════════════════════════

  private columnasPublicas(conDistancia: boolean, idxLat?: number, idxLng?: number): string {
    return `
      l.idlistado, l.titulo, l.descripcion, l.categoria,
      l.volumendisponible::float8 AS volumendisponible, l.unidad,
      l.preciounitario::float8   AS preciounitario,    l.moneda,
      l.ubicacion, l.latitud::float8 AS latitud, l.longitud::float8 AS longitud,
      (l.destacado AND l.destacadohasta > now()) AS destacado,
      l.created_at AS "createdAt", f.nombre AS finca,
      COALESCE((SELECT json_agg(x.url ORDER BY x.orden) FROM listado_foto x WHERE x.idlistado = l.idlistado), '[]'::json) AS fotos
      ${conDistancia ? `, distancia_km($${idxLat}::numeric, $${idxLng}::numeric, l.latitud, l.longitud)::float8 AS "distanciaKm"` : ''}`;
  }

  async catalogo(q: CatalogoQueryDto, user: AuthUser) {
    this.exigirOnline();
    const premium = await this.esPremium(user);

    const params: unknown[] = [];
    const p = (v: unknown) => { params.push(v); return `$${params.length}`; };

    const where: string[] = [
      `l.estado = 'PUBLICADO'`,
      `l.volumendisponible > 0`,
      // Acceso anticipado: los listados Premium recién publicados los ven primero los Premium
      `(l.earlyaccesshasta IS NULL OR l.earlyaccesshasta <= now() OR ${p(premium)}::boolean OR l.idfinca = ${p(user.idfinca)}::int)`,
    ];
    if (q.q) where.push(`(l.titulo ILIKE '%' || ${p(q.q)} || '%' OR l.descripcion ILIKE '%' || $${params.length} || '%')`);
    if (q.categoria) where.push(`l.categoria = ${p(q.categoria)}`);

    const conDistancia = q.lat !== undefined && q.lng !== undefined;
    let idxLat: number | undefined;
    let idxLng: number | undefined;
    if (conDistancia) {
      p(q.lat); idxLat = params.length;
      p(q.lng); idxLng = params.length;
      if (q.radioKm) {
        where.push(`distancia_km($${idxLat}::numeric, $${idxLng}::numeric, l.latitud, l.longitud) <= ${p(q.radioKm)}`);
      }
    }

    const orden = conDistancia
      ? `(l.destacado AND l.destacadohasta > now()) DESC, "distanciaKm" ASC NULLS LAST, l.created_at DESC`
      : `(l.destacado AND l.destacadohasta > now()) DESC, l.created_at DESC`;

    const limit = q.limit ?? 20;
    const offset = q.offset ?? 0;

    return this.ds.query(
      `SELECT ${this.columnasPublicas(conDistancia, idxLat, idxLng)}
         FROM listado l JOIN finca f ON f.idfinca = l.idfinca
        WHERE ${where.join(' AND ')}
        ORDER BY ${orden}
        LIMIT ${p(limit)} OFFSET ${p(offset)}`,
      params,
    );
  }

  async detalle(idlistado: number, user: AuthUser) {
    this.exigirOnline();
    const premium = await this.esPremium(user);
    const [fila] = await this.ds.query(
      `SELECT ${this.columnasPublicas(false)}
         FROM listado l JOIN finca f ON f.idfinca = l.idfinca
        WHERE l.idlistado = $1
          AND l.estado = 'PUBLICADO'
          AND (l.earlyaccesshasta IS NULL OR l.earlyaccesshasta <= now() OR $2::boolean OR l.idfinca = $3::int)`,
      [idlistado, premium, user.idfinca],
    );
    if (!fila) throw new NotFoundException('El producto no está disponible');
    return fila;
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  VENDEDOR (administrador de finca)
  // ═════════════════════════════════════════════════════════════════════════

  /** Todos los listados de la finca activa, en cualquier estado. */
  misListados(idfinca: number) {
    return this.ds.query(
      `SELECT l.idlistado, l.titulo, l.descripcion, l.categoria, l.estado,
              l.volumeninicial::float8 AS volumeninicial, l.volumendisponible::float8 AS volumendisponible,
              l.unidad, l.preciounitario::float8 AS preciounitario, l.moneda, l.ubicacion,
              l.latitud::float8 AS latitud, l.longitud::float8 AS longitud,
              (l.destacado AND l.destacadohasta > now()) AS destacado, l.destacadohasta,
              l.earlyaccesshasta, l.idcosecha, l.created_at AS "createdAt",
              COALESCE((SELECT json_agg(x.url ORDER BY x.orden) FROM listado_foto x WHERE x.idlistado = l.idlistado), '[]'::json) AS fotos
         FROM listado l WHERE l.idfinca = $1 ORDER BY l.created_at DESC`,
      [idfinca],
    );
  }

  async subirFoto(idfinca: number, base64: string) {
    if (base64.length > 9_000_000) throw new BadRequestException('La imagen supera el tamaño máximo (6 MB)');
    const r = await cloudinary.uploader.upload(base64, {
      folder: `agrosmart/marketplace/finca_${idfinca}`,
      transformation: [{ width: 1200, crop: 'limit' }],
    });
    return { url: r.secure_url };
  }

  async crearListado(dto: CreateListadoDto, user: AuthUser, idfinca: number) {
    this.exigirOnline();

    let advertencia: string | null = null;
    if (dto.idcosecha) {
      const [cosecha] = await this.ds.query(
        `SELECT cantidad::float8 AS cantidad, unidad FROM cosecha WHERE idcosecha = $1 AND idfinca = $2`,
        [dto.idcosecha, idfinca],
      );
      if (!cosecha) throw new NotFoundException('La cosecha no existe en esta finca');
      // CU-29, flujo alterno: es una advertencia, no un bloqueo
      if (dto.volumen > cosecha.cantidad) {
        advertencia = `El volumen publicado (${dto.volumen}) supera lo cosechado registrado (${cosecha.cantidad} ${cosecha.unidad}).`;
      }
    }

    const tieneAcceso = await this.planes.tieneFuncion(idfinca, 'early_access');
    const publicar = !dto.borrador;
    const holdHasta = publicar && tieneAcceso ? new Date(Date.now() + EARLY_ACCESS_HORAS * 3600 * 1000) : null;

    const guardado = await this.ds.transaction(async (m) => {
      return m.save(
        Listado,
        m.create(Listado, {
          idfinca,
          idvendedor: user.idusuario,
          idcosecha: dto.idcosecha ?? null,
          titulo: dto.titulo.trim(),
          descripcion: dto.descripcion ?? null,
          categoria: dto.categoria ?? null,
          volumeninicial: dto.volumen,
          volumendisponible: dto.volumen,
          unidad: dto.unidad ?? 'kg',
          preciounitario: dto.preciounitario,
          ubicacion: dto.ubicacion ?? null,
          latitud: dto.latitud ?? null,
          longitud: dto.longitud ?? null,
          estado: publicar ? 'PUBLICADO' : 'BORRADOR',
          earlyaccesshasta: holdHasta,
          fotos: (dto.fotos ?? []).map((url, orden) => ({ url, orden }) as ListadoFoto),
        }),
      );
    });

    // CU-34: avisar a compradores cercanos (si hay acceso anticipado se difiere: aún no lo ve el público)
    if (publicar && !holdHasta) {
      await this.notificarCompradoresCercanos(guardado);
    }

    return { listado: await this.listadoPropio(guardado.idlistado, idfinca), advertencia };
  }

  private async listadoPropio(idlistado: number, idfinca: number) {
    const todos = await this.misListados(idfinca);
    return todos.find((l: any) => l.idlistado === idlistado) ?? null;
  }

  async actualizarListado(idlistado: number, dto: UpdateListadoDto, idfinca: number) {
    this.exigirOnline();
    await this.ds.transaction(async (m) => {
      const [actual] = await m.query(
        `SELECT estado, volumendisponible::float8 AS volumen FROM listado WHERE idlistado = $1 AND idfinca = $2 FOR UPDATE`,
        [idlistado, idfinca],
      );
      if (!actual) throw new NotFoundException('Listado no encontrado en esta finca');

      const cambios: Record<string, unknown> = {};
      for (const c of ['titulo', 'descripcion', 'categoria', 'unidad', 'preciounitario', 'ubicacion', 'latitud', 'longitud'] as const) {
        if (dto[c] !== undefined) cambios[c] = dto[c];
      }
      if (dto.volumen !== undefined) {
        cambios.volumendisponible = dto.volumen;
        if (actual.estado === 'AGOTADO' && dto.volumen > 0) cambios.estado = 'PUBLICADO';
      }
      if (dto.estado !== undefined) cambios.estado = dto.estado;

      if (Object.keys(cambios).length > 0) {
        await m.update(Listado, { idlistado, idfinca }, cambios as any);
      }
      if (dto.fotos !== undefined) {
        await m.delete(ListadoFoto, { idlistado });
        if (dto.fotos.length) {
          await m.insert(ListadoFoto, dto.fotos.map((url, orden) => ({ idlistado, url, orden })));
        }
      }
    });
    return this.listadoPropio(idlistado, idfinca);
  }

  /** Con órdenes asociadas solo se pausa (historial de ventas); sin órdenes se borra. */
  async eliminarListado(idlistado: number, idfinca: number) {
    this.exigirOnline();
    const [propio] = await this.ds.query(`SELECT 1 FROM listado WHERE idlistado = $1 AND idfinca = $2`, [idlistado, idfinca]);
    if (!propio) throw new NotFoundException('Listado no encontrado en esta finca');

    const [{ ordenes }] = await this.ds.query(`SELECT COUNT(*)::int AS ordenes FROM orden_compra WHERE idlistado = $1`, [idlistado]);
    if (ordenes > 0) {
      await this.ds.query(`UPDATE listado SET estado = 'PAUSADO' WHERE idlistado = $1`, [idlistado]);
      return { message: 'El listado tiene órdenes asociadas: quedó pausado en lugar de eliminarse' };
    }
    await this.ds.query(`DELETE FROM listado WHERE idlistado = $1 AND idfinca = $2`, [idlistado, idfinca]);
    return { message: 'Listado eliminado' };
  }

  // ── CU-33 · Listado destacado (Upsell) ────────────────────────────────────
  async destacar(idlistado: number, user: AuthUser, idfinca: number) {
    this.exigirOnline();
    const [l] = await this.ds.query(
      `SELECT estado, destacado, destacadohasta FROM listado WHERE idlistado = $1 AND idfinca = $2`,
      [idlistado, idfinca],
    );
    if (!l) throw new NotFoundException('Listado no encontrado en esta finca');
    if (l.estado !== 'PUBLICADO') throw new BadRequestException('Solo se pueden destacar listados publicados');
    if (l.destacado && l.destacadohasta && new Date(l.destacadohasta) > new Date()) {
      throw new ConflictException(`Este listado ya está destacado hasta ${new Date(l.destacadohasta).toISOString()}`);
    }

    const cobro = await this.pasarela.cobrar(DESTACADO_PRECIO, 'COP', `Listado destacado #${idlistado}`, { idfinca });
    await this.ds.query(
      `INSERT INTO pago (idfinca, idusuario, tipo, monto, moneda, estado, proveedor, referenciaexterna, detalle)
       VALUES ($1, $2, 'LISTADO_DESTACADO', $3, 'COP', $4, $5, $6, $7::jsonb)`,
      [idfinca, user.idusuario, DESTACADO_PRECIO, cobro.aprobado ? 'APROBADO' : 'FALLIDO', cobro.proveedor, cobro.referencia, JSON.stringify({ idlistado })],
    );
    // Si el pago falla, el listado permanece como estándar
    if (!cobro.aprobado) {
      throw new BadRequestException(cobro.motivo ?? 'El pago fue rechazado: el listado sigue siendo estándar');
    }

    await this.ds.query(
      `UPDATE listado SET destacado = true, destacadohasta = now() + make_interval(days => $2::int) WHERE idlistado = $1`,
      [idlistado, DESTACADO_DIAS],
    );
    return { message: `Listado destacado por ${DESTACADO_DIAS} días`, costo: DESTACADO_PRECIO, moneda: 'COP' };
  }

  // ── CU-34 · Alertas de ofertas cercanas ───────────────────────────────────
  private async notificarCompradoresCercanos(l: Listado): Promise<void> {
    if (l.latitud === null || l.longitud === null) return;
    try {
      await this.ds.query(
        `INSERT INTO notificacion (mensaje, tipo, tabla_origen, idregistro, idusuariodestino, titulo, idfinca)
         SELECT $1, 'OFERTA_CERCANA', 'listado', $2, cp.idusuario, 'Oferta cerca de ti', NULL
           FROM comprador_perfil cp
           JOIN usuario u ON u.idusuario = cp.idusuario AND u.activo = true
          WHERE cp.notificaciones = true AND cp.latitud IS NOT NULL AND cp.longitud IS NOT NULL
            AND distancia_km(cp.latitud, cp.longitud, $3::numeric, $4::numeric) <= cp.radioalertaskm`,
        [`${l.titulo} — ${l.volumendisponible} ${l.unidad} a ${l.preciounitario} ${l.moneda}/${l.unidad}`, l.idlistado, l.latitud, l.longitud],
      );
    } catch (err) {
      // Una alerta fallida jamás debe impedir la publicación
      this.logger.warn(`No se pudieron generar alertas cercanas: ${(err as Error).message}`);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  ÓRDENES DE COMPRA (CU-32) y liquidación de comisión (CU-43)
  // ═════════════════════════════════════════════════════════════════════════

  async crearOrden(dto: CreateOrdenDto, user: AuthUser) {
    this.exigirOnline();
    const [l] = await this.ds.query(
      `SELECT idlistado, idfinca, titulo, estado, volumendisponible::float8 AS volumen,
              preciounitario::float8 AS precio, earlyaccesshasta
         FROM listado WHERE idlistado = $1`,
      [dto.idlistado],
    );
    const enEspera = l?.earlyaccesshasta && new Date(l.earlyaccesshasta) > new Date();
    if (!l || l.estado !== 'PUBLICADO' || enEspera) {
      throw new NotFoundException('El producto no está disponible');
    }
    if (dto.cantidad > l.volumen) {
      throw new BadRequestException(`La cantidad excede el volumen disponible (${l.volumen})`);
    }

    // RF-31: comisión según el plan de la finca vendedora
    const plan = await this.planes.getPlan(l.idfinca);
    const subtotal = redondear(dto.cantidad * l.precio);
    const comision = redondear((subtotal * plan.comisionmarketplace) / 100);
    const neto = redondear(subtotal - comision);

    const [orden] = await this.ds.query(
      `INSERT INTO orden_compra (idfinca, idlistado, idcomprador, cantidad, preciounitario, subtotal,
                                 comisionporcentaje, comisionvalor, netovendedor, puntoentrega, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING idorden, estado, cantidad::float8 AS cantidad, subtotal::float8 AS subtotal`,
      [l.idfinca, l.idlistado, user.idusuario, dto.cantidad, l.precio, subtotal, plan.comisionmarketplace, comision, neto, dto.puntoentrega ?? null, dto.notas ?? null],
    );

    await this.notificar({
      idfinca: l.idfinca,
      destino: null,
      tipo: 'ORDEN_NUEVA',
      titulo: 'Nueva orden de compra',
      mensaje: `Orden #${orden.idorden}: ${dto.cantidad} de "${l.titulo}" por ${subtotal}`,
      idregistro: orden.idorden,
    });
    return orden;
  }

  misCompras(user: AuthUser) {
    return this.ds.query(
      `SELECT o.idorden, o.estado, o.cantidad::float8 AS cantidad, o.preciounitario::float8 AS preciounitario,
              o.subtotal::float8 AS subtotal, o.puntoentrega, o.notas, o.created_at AS "createdAt",
              l.titulo, l.unidad, f.nombre AS finca
         FROM orden_compra o
         JOIN listado l ON l.idlistado = o.idlistado
         JOIN finca f   ON f.idfinca = o.idfinca
        WHERE o.idcomprador = $1 ORDER BY o.created_at DESC`,
      [user.idusuario],
    );
  }

  ventas(idfinca: number) {
    return this.ds.query(
      `SELECT o.idorden, o.estado, o.cantidad::float8 AS cantidad, o.preciounitario::float8 AS preciounitario,
              o.subtotal::float8 AS subtotal, o.comisionporcentaje::float8 AS comisionporcentaje,
              o.comisionvalor::float8 AS comisionvalor, o.netovendedor::float8 AS netovendedor,
              o.puntoentrega, o.notas, o.created_at AS "createdAt", o.fechacierre,
              l.titulo, l.unidad,
              u.primernombre AS "compradorNombre", u.telefono AS "compradorTelefono"
         FROM orden_compra o
         JOIN listado l ON l.idlistado = o.idlistado
         JOIN usuario u ON u.idusuario = o.idcomprador
        WHERE o.idfinca = $1 ORDER BY o.created_at DESC`,
      [idfinca],
    );
  }

  /** El vendedor acepta: se descuenta el volumen en el mismo instante (sin sobreventa). */
  async aceptarOrden(idorden: number, idfinca: number) {
    this.exigirOnline();
    return this.ds.transaction(async (m) => {
      const [o] = filas(
        await m.query(
          `UPDATE orden_compra SET estado = 'ACEPTADA', fechaaceptacion = now()
            WHERE idorden = $1 AND idfinca = $2 AND estado = 'PENDIENTE'
        RETURNING idorden, idlistado, cantidad::float8 AS cantidad, idcomprador`,
          [idorden, idfinca],
        ),
      );
      if (!o) throw new ConflictException('La orden no existe en tu finca o ya fue procesada');

      const descontado = filas(
        await m.query(
          `UPDATE listado
              SET volumendisponible = volumendisponible - $2,
                  estado = CASE WHEN volumendisponible - $2 <= 0 THEN 'AGOTADO' ELSE estado END
            WHERE idlistado = $1 AND volumendisponible >= $2
        RETURNING idlistado`,
          [o.idlistado, o.cantidad],
        ),
      );
      // Si ya no alcanza, el throw revierte también el cambio de estado de la orden
      if (!descontado.length) throw new ConflictException('El volumen disponible ya no alcanza para esta orden');

      await this.notificar({
        idfinca: null, destino: o.idcomprador, tipo: 'ORDEN_ACEPTADA', titulo: 'Tu orden fue aceptada',
        mensaje: `El vendedor aceptó tu orden #${o.idorden}. Coordina la recogida o entrega.`, idregistro: o.idorden,
      }, m);
      return { idorden: o.idorden, estado: 'ACEPTADA' };
    });
  }

  async rechazarOrden(idorden: number, idfinca: number) {
    this.exigirOnline();
    const [o] = filas(
      await this.ds.query(
        `UPDATE orden_compra SET estado = 'RECHAZADA'
          WHERE idorden = $1 AND idfinca = $2 AND estado = 'PENDIENTE'
      RETURNING idorden, idcomprador`,
        [idorden, idfinca],
      ),
    );
    if (!o) throw new ConflictException('La orden no existe en tu finca o ya fue procesada');
    await this.notificar({
      idfinca: null, destino: o.idcomprador, tipo: 'ORDEN_RECHAZADA', titulo: 'Tu orden fue rechazada',
      mensaje: `El vendedor rechazó tu orden #${o.idorden}.`, idregistro: o.idorden,
    });
    return { idorden: o.idorden, estado: 'RECHAZADA' };
  }

  /** Cierre de la venta: liquida y registra la comisión como ingreso de AgroSmart (CU-43). */
  async cerrarOrden(idorden: number, idfinca: number, user: AuthUser) {
    this.exigirOnline();
    return this.ds.transaction(async (m) => {
      const [o] = filas(
        await m.query(
          `UPDATE orden_compra SET estado = 'CERRADA', fechacierre = now()
            WHERE idorden = $1 AND idfinca = $2 AND estado = 'ACEPTADA'
        RETURNING idorden, comisionvalor::float8 AS comision, netovendedor::float8 AS neto, idcomprador`,
          [idorden, idfinca],
        ),
      );
      if (!o) throw new ConflictException('Solo se pueden cerrar órdenes aceptadas de tu finca');

      await m.query(
        `INSERT INTO pago (idfinca, idusuario, tipo, monto, moneda, estado, proveedor, referenciaexterna, detalle)
         VALUES ($1, $2, 'COMISION_MARKETPLACE', $3, 'COP', 'APROBADO', 'INTERNO', $4, $5::jsonb)`,
        [idfinca, user.idusuario, o.comision, `ORDEN-${o.idorden}`, JSON.stringify({ idorden: o.idorden })],
      );
      return { idorden: o.idorden, estado: 'CERRADA', comision: o.comision, netoVendedor: o.neto };
    });
  }

  /** Cancelar: el comprador sus propias órdenes; el vendedor las que ya aceptó. No se liquida comisión. */
  async cancelarOrden(idorden: number, user: AuthUser) {
    this.exigirOnline();
    return this.ds.transaction(async (m) => {
      const [o] = await m.query(
        `SELECT idorden, idlistado, idfinca, idcomprador, estado, cantidad::float8 AS cantidad
           FROM orden_compra WHERE idorden = $1 FOR UPDATE`,
        [idorden],
      );
      const esComprador = user.rol === 'comprador' && o?.idcomprador === user.idusuario;
      const esVendedor = user.rol === 'admin' && o?.idfinca === user.idfinca;
      if (!o || (!esComprador && !esVendedor)) throw new NotFoundException('Orden no encontrada');

      const cancelable = esComprador ? ['PENDIENTE', 'ACEPTADA'] : ['ACEPTADA'];
      if (!cancelable.includes(o.estado)) throw new ConflictException(`Una orden ${o.estado} no se puede cancelar`);

      // Si ya había descontado volumen, se devuelve al listado
      if (o.estado === 'ACEPTADA') {
        await m.query(
          `UPDATE listado
              SET volumendisponible = volumendisponible + $2,
                  estado = CASE WHEN estado = 'AGOTADO' THEN 'PUBLICADO' ELSE estado END
            WHERE idlistado = $1`,
          [o.idlistado, o.cantidad],
        );
      }
      await m.query(`UPDATE orden_compra SET estado = 'CANCELADA' WHERE idorden = $1`, [idorden]);

      await this.notificar(
        esComprador
          ? { idfinca: o.idfinca, destino: null, tipo: 'ORDEN_CANCELADA', titulo: 'Orden cancelada', mensaje: `El comprador canceló la orden #${o.idorden}.`, idregistro: o.idorden }
          : { idfinca: null, destino: o.idcomprador, tipo: 'ORDEN_CANCELADA', titulo: 'Orden cancelada', mensaje: `El vendedor canceló la orden #${o.idorden}.`, idregistro: o.idorden },
        m,
      );
      return { idorden: o.idorden, estado: 'CANCELADA' };
    });
  }

  private async notificar(
    n: { idfinca: number | null; destino: number | null; tipo: string; titulo: string; mensaje: string; idregistro: number },
    m?: EntityManager,
  ): Promise<void> {
    await (m ?? this.ds).query(
      `INSERT INTO notificacion (mensaje, tipo, tabla_origen, idregistro, idusuariodestino, titulo, idfinca)
       VALUES ($1, $2, 'orden_compra', $3, $4, $5, $6)`,
      [n.mensaje, n.tipo, n.idregistro, n.destino, n.titulo, n.idfinca],
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  CARRITO Y WISHLIST (CU-46)
  // ═════════════════════════════════════════════════════════════════════════

  async verCarrito(user: AuthUser) {
    await this.exigirCarrito(user);
    return this.ds.query(
      `SELECT c.idlistado, c.cantidad::float8 AS cantidad, l.titulo, l.unidad,
              l.preciounitario::float8 AS preciounitario,
              (l.estado = 'PUBLICADO' AND l.volumendisponible > 0) AS disponible,
              (c.cantidad * l.preciounitario)::float8 AS subtotal
         FROM carrito_item c JOIN listado l ON l.idlistado = c.idlistado
        WHERE c.idusuario = $1 ORDER BY c.created_at DESC`,
      [user.idusuario],
    );
  }

  async guardarEnCarrito(dto: CarritoItemDto, user: AuthUser) {
    await this.exigirCarrito(user);
    await this.exigirListadoPublicado(dto.idlistado);
    await this.ds.query(
      `INSERT INTO carrito_item (idusuario, idlistado, cantidad) VALUES ($1, $2, $3)
       ON CONFLICT (idusuario, idlistado) DO UPDATE SET cantidad = EXCLUDED.cantidad`,
      [user.idusuario, dto.idlistado, dto.cantidad],
    );
    return this.verCarrito(user);
  }

  async quitarDelCarrito(idlistado: number, user: AuthUser) {
    await this.exigirCarrito(user);
    await this.ds.query(`DELETE FROM carrito_item WHERE idusuario = $1 AND idlistado = $2`, [user.idusuario, idlistado]);
    return this.verCarrito(user);
  }

  /** Convierte el carrito en órdenes (una por producto). Los que fallen quedan en el carrito. */
  async ordenarCarrito(user: AuthUser) {
    this.exigirOnline();
    const items = await this.verCarrito(user);
    const creadas: unknown[] = [];
    const fallidas: { idlistado: number; motivo: string }[] = [];

    for (const it of items) {
      try {
        creadas.push(await this.crearOrden({ idlistado: it.idlistado, cantidad: it.cantidad }, user));
        await this.ds.query(`DELETE FROM carrito_item WHERE idusuario = $1 AND idlistado = $2`, [user.idusuario, it.idlistado]);
      } catch (err) {
        fallidas.push({ idlistado: it.idlistado, motivo: (err as Error).message });
      }
    }
    return { creadas, fallidas };
  }

  async verWishlist(user: AuthUser) {
    await this.exigirCarrito(user);
    return this.ds.query(
      `SELECT w.idlistado, l.titulo, l.unidad, l.preciounitario::float8 AS preciounitario,
              (l.estado = 'PUBLICADO' AND l.volumendisponible > 0) AS disponible
         FROM wishlist_item w JOIN listado l ON l.idlistado = w.idlistado
        WHERE w.idusuario = $1 ORDER BY w.created_at DESC`,
      [user.idusuario],
    );
  }

  async guardarEnWishlist(idlistado: number, user: AuthUser) {
    await this.exigirCarrito(user);
    await this.exigirListadoPublicado(idlistado);
    await this.ds.query(
      `INSERT INTO wishlist_item (idusuario, idlistado) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [user.idusuario, idlistado],
    );
    return this.verWishlist(user);
  }

  async quitarDeWishlist(idlistado: number, user: AuthUser) {
    await this.exigirCarrito(user);
    await this.ds.query(`DELETE FROM wishlist_item WHERE idusuario = $1 AND idlistado = $2`, [user.idusuario, idlistado]);
    return this.verWishlist(user);
  }

  private async exigirListadoPublicado(idlistado: number): Promise<void> {
    const [l] = await this.ds.query(`SELECT 1 FROM listado WHERE idlistado = $1 AND estado = 'PUBLICADO'`, [idlistado]);
    if (!l) throw new NotFoundException('El producto no está disponible');
  }
}
