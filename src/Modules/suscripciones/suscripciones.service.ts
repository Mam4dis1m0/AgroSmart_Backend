// src/Modules/suscripciones/suscripciones.service.ts
//
// Planes SaaS y suscripción mensual por finca (EP-12: RF-41, RF-42, CU-42).
//   Freemium → por defecto al registrar la finca.
//   Premium  → "Plan Pro": cobro mensual; al cancelar la finca vuelve a Freemium
//              conservando todos sus datos (RNF-19).

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  ForbiddenException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, EntityManager } from 'typeorm';
import { PlanService } from '../../auth/plan.service';
import { AuthUser } from '../../auth/tenant-context';
import { filas } from '../../common/sql';
import { v2 as cloudinary } from 'cloudinary';
import { PasarelaPagoService } from './pasarela-pago.service';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const MESES_POR_CICLO = 1;
/** Días antes del vencimiento en que ya se puede pagar el siguiente mes. */
const DIAS_RENOVACION = 7;
/** Plan Premium de los compradores y tipo de sus pagos. */
const PLAN_COMPRADOR = 'COMPRADOR_PREMIUM';
const TIPO_PAGO_COMPRADOR = 'SUSCRIPCION_COMPRADOR';

@Injectable()
export class SuscripcionesService {
  private readonly logger = new Logger(SuscripcionesService.name);

  constructor(
    private readonly ds: DataSource,
    private readonly planes: PlanService,
    private readonly pasarela: PasarelaPagoService,
  ) {}

  private exigirOnline() {
    if (!this.ds.isInitialized) {
      throw new ServiceUnavailableException(
        'Esta operación requiere conexión a internet',
      );
    }
  }

  /** Planes de fincas (admin/empleado) o de compradores, según quién pregunta. */
  listarPlanes(user?: AuthUser) {
    this.exigirOnline();
    return this.ds.query(
      `SELECT idplan, codigo, nombre, descripcion, preciomensual::float8 AS preciomensual, moneda,
              maxcultivos, maxempleados, maxfincas, comisionmarketplace::float8 AS comisionmarketplace, funciones
         FROM plan WHERE activo = true AND COALESCE(audiencia, 'finca') = $1
        ORDER BY preciomensual`,
      [user?.rol === 'comprador' ? 'comprador' : 'finca'],
    );
  }

  // ── Premium del comprador (suscripción por usuario, no por finca) ─────────
  //   Beneficios: ve las ofertas nuevas de inmediato (sin la espera de las ofertas
  //   Freemium), recibe la alerta "oferta cerca" apenas se publica y aparece como
  //   "Comprador Premium" ante los vendedores.

  async miSuscripcionComprador(idusuario: number) {
    this.exigirOnline();
    const [cp] = await this.ds.query(
      `SELECT premiumhasta FROM comprador_perfil WHERE idusuario = $1`,
      [idusuario],
    );
    const hasta = (cp?.premiumhasta as Date | null) ?? null;
    const activo = hasta != null && new Date(hasta).getTime() > Date.now();
    return {
      plan: activo ? PLAN_COMPRADOR : 'GRATIS',
      premium: activo,
      premiumhasta: activo ? hasta : null,
    };
  }

  pagosComprador(idusuario: number) {
    this.exigirOnline();
    return this.ds.query(
      `SELECT idpago, tipo, monto::float8 AS monto, moneda, estado, proveedor, referenciaexterna, created_at
         FROM pago WHERE idusuario = $1 AND tipo = $2 ORDER BY created_at DESC LIMIT 100`,
      [idusuario, TIPO_PAGO_COMPRADOR],
    );
  }

  async contratarComprador(
    user: AuthUser,
    opts: { metodo?: string; referencia?: string; comprobante?: string } = {},
  ) {
    this.exigirOnline();
    const [plan] = await this.ds.query(
      `SELECT idplan, preciomensual::float8 AS precio, moneda FROM plan WHERE codigo = $1 AND activo = true`,
      [PLAN_COMPRADOR],
    );
    if (!plan)
      throw new NotFoundException(
        'El plan Premium para compradores no está disponible',
      );

    const [lejos] = await this.ds.query(
      `SELECT 1 FROM comprador_perfil
        WHERE idusuario = $1 AND premiumhasta > now() + make_interval(days => $2::int)`,
      [user.idusuario, DIAS_RENOVACION],
    );
    if (lejos) {
      throw new ConflictException(
        `Ya tienes Premium activo. Podrás renovarlo ${DIAS_RENOVACION} días antes de que venza.`,
      );
    }

    const metodo = (opts.metodo ?? 'SIMULADO').toUpperCase();
    if (metodo === 'NEQUI') {
      return this.registrarTransferencia(
        { idfinca: null, tipo: TIPO_PAGO_COMPRADOR },
        user,
        plan,
        opts,
      );
    }
    if (metodo !== 'SIMULADO') {
      throw new BadRequestException('Método de pago no soportado');
    }
    const cobro = await this.pasarela.cobrar(
      plan.precio,
      plan.moneda,
      `Premium comprador ${user.idusuario}`,
    );
    const idpago = await this.ds.transaction(async (m) => {
      const [pago] = await m.query(
        `INSERT INTO pago (idfinca, idusuario, tipo, monto, moneda, estado, proveedor, referenciaexterna)
         VALUES (NULL, $1, $2, $3, $4, 'APROBADO', $5, $6) RETURNING idpago`,
        [
          user.idusuario,
          TIPO_PAGO_COMPRADOR,
          plan.precio,
          plan.moneda,
          cobro.proveedor,
          cobro.referencia,
        ],
      );
      await this.activarComprador(m, user.idusuario);
      return pago.idpago as number;
    });
    return {
      pago: { idpago, estado: 'APROBADO' },
      mensaje: '¡Premium activado!',
    };
  }

  /** Suma un mes de Premium al comprador (desde hoy o desde su vencimiento). */
  private async activarComprador(m: EntityManager, idusuario: number) {
    await m.query(
      `INSERT INTO comprador_perfil (idusuario, premiumhasta)
       VALUES ($1, now() + make_interval(months => $2::int))
       ON CONFLICT (idusuario) DO UPDATE
         SET premiumhasta = GREATEST(COALESCE(comprador_perfil.premiumhasta, now()), now())
                            + make_interval(months => $2::int),
             updated_at = now()`,
      [idusuario, MESES_POR_CICLO],
    );
  }

  /** Estado de la suscripción de la finca activa + plan efectivo (con límites). */
  async miSuscripcion(idfinca: number) {
    this.exigirOnline();
    const [suscripcion] = await this.ds.query(
      `SELECT s.idsuscripcion, s.estado, s.fechainicio, s.fechafin, s.renovacionautomatica, p.codigo AS plan
         FROM suscripcion s JOIN plan p ON p.idplan = s.idplan
        WHERE s.idfinca = $1 AND s.estado = 'ACTIVA'`,
      [idfinca],
    );
    const planEfectivo = await this.planes.getPlan(idfinca);
    return { suscripcion: suscripcion ?? null, planEfectivo };
  }

  pagos(idfinca: number) {
    this.exigirOnline();
    return this.ds.query(
      `SELECT idpago, tipo, monto::float8 AS monto, moneda, estado, proveedor, referenciaexterna, created_at
         FROM pago WHERE idfinca = $1 ORDER BY created_at DESC LIMIT 100`,
      [idfinca],
    );
  }

  /** Métodos de pago disponibles en este servidor (para que la app muestre los correctos). */
  // ── Pago por transferencia Nequi (manual) ─────────────────────────────────
  //
  // 1. La app muestra el número Nequi de AgroSmart (NEQUI_NUMERO / NEQUI_TITULAR).
  // 2. El administrador de la finca transfiere y envía la referencia + foto del comprobante.
  // 3. Un revisor (correo en PAGOS_REVISORES) lo compara con su app Nequi y lo aprueba
  //    o rechaza. Al aprobarlo se activa (o se suma) un mes de Premium.

  private cuentaNequi() {
    const numero = (process.env.NEQUI_NUMERO ?? '').replace(/\D/g, '');
    return numero
      ? { numero, titular: process.env.NEQUI_TITULAR ?? 'AgroSmart' }
      : null;
  }

  esRevisor(user: AuthUser) {
    const lista = (process.env.PAGOS_REVISORES ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    return lista.includes((user.email ?? '').toLowerCase());
  }

  private exigirRevisor(user: AuthUser) {
    if (!this.esRevisor(user)) {
      throw new ForbiddenException('No tienes permiso para revisar pagos');
    }
  }

  /** Lo que la app necesita para mostrar las opciones de pago. */
  metodosPago(user: AuthUser) {
    return {
      nequi: this.cuentaNequi(),
      simulado: this.pasarela.simuladoPermitido(),
      revisor: this.esRevisor(user),
    };
  }

  // ── CU-42 · Contratar / renovar Premium ───────────────────────────────────
  async contratar(
    idfinca: number,
    user: AuthUser,
    opts: { metodo?: string; referencia?: string; comprobante?: string } = {},
  ) {
    this.exigirOnline();

    const [premium] = await this.ds.query(
      `SELECT idplan, preciomensual::float8 AS precio, moneda FROM plan WHERE codigo = 'PREMIUM' AND activo = true`,
    );
    if (!premium)
      throw new NotFoundException('El plan Premium no está disponible');

    // Ya es Premium: solo se paga el mes siguiente cuando faltan pocos días.
    const actual = await this.planes.getPlan(idfinca);
    if (actual.codigo === 'PREMIUM') {
      const [lejos] = await this.ds.query(
        `SELECT 1 FROM suscripcion
          WHERE idfinca = $1 AND estado = 'ACTIVA'
            AND (fechafin IS NULL OR fechafin > now() + make_interval(days => $2::int))`,
        [idfinca, DIAS_RENOVACION],
      );
      if (lejos) {
        throw new ConflictException(
          `Tu finca ya tiene Premium activo. Podrás renovarlo ${DIAS_RENOVACION} días antes de que venza.`,
        );
      }
    }

    const metodo = (opts.metodo ?? 'SIMULADO').toUpperCase();
    if (metodo === 'NEQUI') {
      return this.registrarTransferencia(
        { idfinca, tipo: 'SUSCRIPCION' },
        user,
        premium,
        opts,
      );
    }
    if (metodo !== 'SIMULADO') {
      throw new BadRequestException('Método de pago no soportado');
    }

    // ── Simulado (desarrollo / demostración; bloqueado en producción) ──
    const cobro = await this.pasarela.cobrar(
      premium.precio,
      premium.moneda,
      `Suscripción Premium finca ${idfinca}`,
      { idfinca, idusuario: user.idusuario },
    );
    const idpago = await this.ds.transaction(async (m) => {
      const [pago] = await m.query(
        `INSERT INTO pago (idfinca, idusuario, tipo, monto, moneda, estado, proveedor, referenciaexterna)
         VALUES ($1, $2, 'SUSCRIPCION', $3, $4, 'APROBADO', $5, $6) RETURNING idpago`,
        [
          idfinca,
          user.idusuario,
          premium.precio,
          premium.moneda,
          cobro.proveedor,
          cobro.referencia,
        ],
      );
      await this.activarPremium(m, idfinca, premium.idplan, pago.idpago, true);
      return pago.idpago as number;
    });
    this.planes.invalidar(idfinca);
    return {
      pago: { idpago, estado: 'APROBADO' },
      mensaje: '¡Premium activado!',
    };
  }

  private async registrarTransferencia(
    destino: { idfinca: number | null; tipo: string },
    user: AuthUser,
    premium: { idplan: number; precio: number; moneda: string },
    opts: { referencia?: string; comprobante?: string },
  ) {
    if (!this.cuentaNequi()) {
      throw new ServiceUnavailableException(
        'El pago por Nequi no está configurado en este servidor',
      );
    }
    // Se aceptan espacios, puntos, '#', etc. al copiar la referencia: solo se
    // guardan letras y números (ej. "M 1234.5678" -> "M12345678").
    const referencia = (opts.referencia ?? '')
      .normalize('NFKD')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (referencia.length < 4 || referencia.length > 40) {
      throw new BadRequestException(
        'Escribe la referencia que aparece en el comprobante de Nequi (mínimo 4 letras o números)',
      );
    }

    // Una referencia solo puede usarse una vez (evita reutilizar un comprobante).
    const [usada] = await this.ds.query(
      `SELECT 1 FROM pago WHERE proveedor = 'NEQUI' AND referenciaexterna = $1 AND estado <> 'FALLIDO'`,
      [referencia],
    );
    if (usada) {
      throw new ConflictException('Esa referencia ya fue registrada');
    }
    const { idfinca, tipo } = destino;
    // La finca (o el comprador) solo puede tener un pago en revisión a la vez.
    const [pendiente] = await this.ds.query(
      idfinca != null
        ? `SELECT 1 FROM pago WHERE idfinca = $1 AND proveedor = 'NEQUI' AND estado = 'PENDIENTE'`
        : `SELECT 1 FROM pago WHERE idusuario = $1 AND tipo = $2 AND proveedor = 'NEQUI' AND estado = 'PENDIENTE'`,
      idfinca != null ? [idfinca] : [user.idusuario, tipo],
    );
    if (pendiente) {
      throw new ConflictException(
        'Ya tienes un pago en revisión. Te avisaremos cuando lo confirmemos.',
      );
    }

    let comprobanteurl: string | null = null;
    const comprobante = (opts.comprobante ?? '').trim();
    if (comprobante) {
      const m = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(
        comprobante,
      );
      if (!m) {
        throw new BadRequestException(
          'El comprobante debe ser una foto (JPG, PNG o similar)',
        );
      }
      // Tamaño real del archivo (base64 ocupa ~4/3 del original).
      const bytes = Math.floor((m[2].replace(/\s/g, '').length * 3) / 4);
      if (bytes > 5 * 1024 * 1024) {
        throw new BadRequestException(
          'La foto supera el tamaño máximo (5 MB). Toma una captura de pantalla o redúcela.',
        );
      }
      try {
        const r = await cloudinary.uploader.upload(comprobante, {
          folder:
            idfinca != null
              ? `agrosmart/pagos/finca_${idfinca}`
              : `agrosmart/pagos/comprador_${user.idusuario}`,
          resource_type: 'image',
          transformation: [{ width: 1400, crop: 'limit' }],
        });
        comprobanteurl = r.secure_url;
      } catch (e) {
        console.error('Error subiendo comprobante a Cloudinary:', e);
        throw new ServiceUnavailableException(
          'No pudimos subir la foto del comprobante. Intenta de nuevo o envía el pago solo con la referencia.',
        );
      }
    }

    const [pago] = await this.ds.query(
      `INSERT INTO pago (idfinca, idusuario, tipo, monto, moneda, estado, proveedor, referenciaexterna, detalle)
       VALUES ($1, $2, $7, $3, $4, 'PENDIENTE', 'NEQUI', $5, $6) RETURNING idpago`,
      [
        idfinca,
        user.idusuario,
        premium.precio,
        premium.moneda,
        referencia,
        JSON.stringify({ idplan: premium.idplan, comprobanteurl }),
        tipo,
      ],
    );
    return {
      pago: { idpago: pago.idpago, estado: 'PENDIENTE' },
      mensaje:
        'Recibimos tu comprobante. Activaremos Premium en cuanto confirmemos la transferencia.',
    };
  }

  /** Pagos Nequi esperando revisión (solo revisores). */
  pagosPorRevisar(user: AuthUser) {
    this.exigirOnline();
    this.exigirRevisor(user);
    return this.ds.query(
      `SELECT p.idpago, p.monto::float8 AS monto, p.moneda, p.referenciaexterna AS referencia,
              p.detalle->>'comprobanteurl' AS comprobanteurl, p.created_at,
              COALESCE(f.nombre, 'Comprador (Premium personal)') AS finca, p.tipo, TRIM(COALESCE(u.primernombre, '') || ' ' || COALESCE(u.primerapellido, '')) AS usuario, u.email
         FROM pago p
         LEFT JOIN finca f ON f.idfinca = p.idfinca
         LEFT JOIN usuario u ON u.idusuario = p.idusuario
        WHERE p.proveedor = 'NEQUI' AND p.estado = 'PENDIENTE'
        ORDER BY p.created_at`,
    );
  }

  /** El revisor confirma (o rechaza) la transferencia. Idempotente. */
  async revisarPago(user: AuthUser, idpago: number, aprobar: boolean) {
    this.exigirOnline();
    this.exigirRevisor(user);
    const idfinca = await this.ds.transaction(async (m) => {
      const [p] = await m.query(
        `SELECT idfinca, idusuario, tipo, detalle, estado FROM pago
          WHERE idpago = $1 AND proveedor = 'NEQUI' FOR UPDATE`,
        [idpago],
      );
      if (!p) throw new NotFoundException('Pago no encontrado');
      if (p.estado !== 'PENDIENTE') {
        throw new ConflictException('Este pago ya fue revisado');
      }
      await m.query(
        `UPDATE pago SET estado = $2,
                detalle = COALESCE(detalle, '{}'::jsonb) || jsonb_build_object('revisadopor', $3::text, 'revisadoen', now())
          WHERE idpago = $1`,
        [idpago, aprobar ? 'APROBADO' : 'FALLIDO', user.email],
      );
      if (!aprobar) return null;
      if (p.tipo === TIPO_PAGO_COMPRADOR) {
        await this.activarComprador(m, p.idusuario);
        return null;
      }
      const [premium] = await m.query(
        `SELECT idplan FROM plan WHERE codigo = 'PREMIUM'`,
      );
      const det = (p.detalle ?? {}) as { idplan?: number };
      // Transferencia manual: no hay débito automático, se renueva pagando cada mes.
      await this.activarPremium(
        m,
        p.idfinca,
        det.idplan ?? premium.idplan,
        idpago,
        false,
      );
      return p.idfinca as number;
    });
    if (idfinca != null) {
      this.planes.invalidar(idfinca);
      this.logger.log(`✅ Finca ${idfinca}: Premium activado (pago ${idpago})`);
    }
    return { idpago, estado: aprobar ? 'APROBADO' : 'FALLIDO' };
  }

  /** Activa Premium, o suma un mes si ya estaba activo, dentro de una transacción. */
  private async activarPremium(
    m: EntityManager,
    idfinca: number,
    idplan: number,
    idpago: number,
    renovacionAutomatica: boolean,
  ) {
    const [vigente] = await m.query(
      `SELECT idsuscripcion FROM suscripcion
        WHERE idfinca = $1 AND estado = 'ACTIVA' AND idplan = $2`,
      [idfinca, idplan],
    );
    if (vigente) {
      // Renovación anticipada: el mes pagado se suma a los días que quedaban.
      await m.query(
        `UPDATE suscripcion
            SET fechafin = GREATEST(COALESCE(fechafin, now()), now()) + make_interval(months => $2::int),
                idpago = $3, renovacionautomatica = $4
          WHERE idsuscripcion = $1`,
        [vigente.idsuscripcion, MESES_POR_CICLO, idpago, renovacionAutomatica],
      );
    } else {
      await m.query(
        `UPDATE suscripcion SET estado = 'CANCELADA', fechafin = now(), renovacionautomatica = false
          WHERE idfinca = $1 AND estado = 'ACTIVA'`,
        [idfinca],
      );
      await m.query(
        `INSERT INTO suscripcion (idfinca, idplan, estado, fechafin, idpago, renovacionautomatica)
         VALUES ($1, $2, 'ACTIVA', now() + make_interval(months => $3::int), $4, $5)`,
        [idfinca, idplan, MESES_POR_CICLO, idpago, renovacionAutomatica],
      );
    }
    await m.query(
      `UPDATE finca SET idplan = $2,
              planvencimiento = (SELECT fechafin FROM suscripcion WHERE idfinca = $1 AND estado = 'ACTIVA' LIMIT 1)
        WHERE idfinca = $1`,
      [idfinca, idplan],
    );
  }

  // ── Cancelar → vuelve a Freemium conservando los datos ────────────────────
  async cancelar(idfinca: number) {
    this.exigirOnline();
    const [free] = await this.ds.query(
      `SELECT idplan FROM plan WHERE codigo = 'FREEMIUM'`,
    );
    if (!free) throw new NotFoundException('Falta el plan FREEMIUM');

    const actual = await this.planes.getPlan(idfinca);
    if (actual.codigo !== 'PREMIUM') {
      throw new ConflictException('Tu finca ya está en el plan Freemium');
    }
    await this.bajarAFreemium(idfinca, free.idplan, 'CANCELADA');
    return this.miSuscripcion(idfinca);
  }

  private async bajarAFreemium(
    idfinca: number,
    idPlanFree: number,
    estadoPrevia: 'CANCELADA' | 'VENCIDA',
  ) {
    await this.ds.transaction(async (m) => {
      await m.query(
        `UPDATE suscripcion SET estado = $2, fechafin = now(), renovacionautomatica = false
          WHERE idfinca = $1 AND estado = 'ACTIVA'`,
        [idfinca, estadoPrevia],
      );
      await m.query(
        `INSERT INTO suscripcion (idfinca, idplan, estado) VALUES ($1, $2, 'ACTIVA')`,
        [idfinca, idPlanFree],
      );
      await m.query(
        `UPDATE finca SET idplan = $2, planvencimiento = NULL WHERE idfinca = $1`,
        [idfinca, idPlanFree],
      );
    });
    this.planes.invalidar(idfinca);
  }

  // ── Renovación / vencimiento automático ───────────────────────────────────
  // Corre fuera de una petición HTTP: solo SQL, sin contexto de finca.
  @Cron(CronExpression.EVERY_HOUR)
  async procesarVencimientos() {
    if (!this.ds.isInitialized) return;
    try {
      const vencidas = filas<{
        idsuscripcion: number;
        idfinca: number;
        idplan: number;
        renovacionautomatica: boolean;
        idusuario: number | null;
      }>(
        await this.ds.query(
          `SELECT s.idsuscripcion, s.idfinca, s.idplan, s.renovacionautomatica, f.idpropietario AS idusuario
             FROM suscripcion s
             JOIN plan p  ON p.idplan = s.idplan AND p.codigo <> 'FREEMIUM'
             JOIN finca f ON f.idfinca = s.idfinca
            WHERE s.estado = 'ACTIVA' AND s.fechafin IS NOT NULL AND s.fechafin < now()`,
        ),
      );
      if (vencidas.length === 0) return;

      const [free] = await this.ds.query(
        `SELECT idplan FROM plan WHERE codigo = 'FREEMIUM'`,
      );
      for (const s of vencidas) {
        try {
          if (s.renovacionautomatica && (await this.renovar(s))) continue;
          await this.bajarAFreemium(s.idfinca, free.idplan, 'VENCIDA');
          this.logger.warn(
            `⏬ Finca ${s.idfinca}: suscripción vencida, vuelve a Freemium`,
          );
        } catch (err) {
          this.logger.error(
            `No se pudo procesar la suscripción ${s.idsuscripcion}: ${(err as Error).message}`,
          );
        }
      }
    } catch (err) {
      this.logger.warn(`procesarVencimientos: ${(err as Error).message}`);
    }
  }

  private async renovar(s: {
    idsuscripcion: number;
    idfinca: number;
    idplan: number;
    idusuario: number | null;
  }): Promise<boolean> {
    const [plan] = await this.ds.query(
      `SELECT preciomensual::float8 AS precio, moneda FROM plan WHERE idplan = $1`,
      [s.idplan],
    );
    let cobro;
    try {
      cobro = await this.pasarela.cobrar(
        plan.precio,
        plan.moneda,
        `Renovación finca ${s.idfinca}`,
        { idfinca: s.idfinca },
      );
    } catch {
      return false; // pasarela no disponible: se trata como pago fallido
    }
    const [pago] = await this.ds.query(
      `INSERT INTO pago (idfinca, idusuario, tipo, monto, moneda, estado, proveedor, referenciaexterna)
       VALUES ($1, $2, 'SUSCRIPCION', $3, $4, $5, $6, $7) RETURNING idpago`,
      [
        s.idfinca,
        s.idusuario,
        plan.precio,
        plan.moneda,
        cobro.aprobado ? 'APROBADO' : 'FALLIDO',
        cobro.proveedor,
        cobro.referencia,
      ],
    );
    if (!cobro.aprobado) return false;

    await this.ds.query(
      `UPDATE suscripcion SET fechafin = fechafin + make_interval(months => $2::int), idpago = $3 WHERE idsuscripcion = $1`,
      [s.idsuscripcion, MESES_POR_CICLO, pago.idpago],
    );
    await this.ds.query(
      `UPDATE finca SET planvencimiento = (SELECT fechafin FROM suscripcion WHERE idsuscripcion = $2) WHERE idfinca = $1`,
      [s.idfinca, s.idsuscripcion],
    );
    this.planes.invalidar(s.idfinca);
    return true;
  }
}
