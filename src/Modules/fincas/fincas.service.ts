// src/Modules/fincas/fincas.service.ts
//
// Multi-tenant (EP-10): registrar finca, listar mis fincas, seleccionar la finca activa
// (emite un JWT nuevo con idfinca), administrar miembros y Dashboard Central.
//
// Toda la información de una finca se aísla por idfinca; aquí vive la membresía
// (tabla finca_usuario) que decide a qué fincas puede entrar cada usuario.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Finca } from '../../Entidades/entities/Finca';
import { FincaUsuario } from '../../Entidades/entities/FincaUsuario';
import { CreateFincaDto, UpdateFincaDto } from '../../dto/finca.dto';
import { PlanService } from '../../auth/plan.service';
import { SesionService } from '../../auth/sesion.service';
import { AuthUser, Rol } from '../../auth/tenant-context';
import { TokenService } from '../../auth/token.service';
import { esViolacionUnica, filas } from '../../common/sql';

export interface FincaResumen {
  idfinca: number;
  nombre: string;
  ubicacion: string | null;
  tipoproduccion: string | null;
  rol: 'admin' | 'empleado';
  plan: string;
}

@Injectable()
export class FincasService {
  private readonly logger = new Logger(FincasService.name);

  constructor(
    @InjectRepository(Finca) private readonly fincaRepo: Repository<Finca>,
    @InjectRepository(FincaUsuario) private readonly miembroRepo: Repository<FincaUsuario>,
    private readonly ds: DataSource,
    private readonly planes: PlanService,
    private readonly sesiones: SesionService,
    private readonly tokens: TokenService,
  ) {}

  private exigirOnline(): void {
    if (!this.ds.isInitialized) {
      throw new ServiceUnavailableException('Esta operación requiere conexión a internet');
    }
  }

  // ── Fincas del usuario (selector de finca, login) ─────────────────────────
  async listarDeUsuario(idusuario: number): Promise<FincaResumen[]> {
    const rows = await this.ds.query(
      `SELECT f.idfinca, f.nombre, f.ubicacion, f.tipoproduccion, fu.rol, p.codigo AS plan
         FROM finca_usuario fu
         JOIN finca f ON f.idfinca = fu.idfinca
         JOIN plan  p ON p.idplan  = f.idplan
        WHERE fu.idusuario = $1 AND fu.activo = true AND f.activo = true
        ORDER BY f.nombre`,
      [idusuario],
    );
    return rows;
  }

  // ── CU-35 · Registrar finca ───────────────────────────────────────────────
  async registrar(dto: CreateFincaDto, user: AuthUser) {
    this.exigirOnline();

    // RF-41: Freemium permite una sola finca; con una finca Premium vigente no hay tope
    const [estado] = await this.ds.query(
      `SELECT COUNT(*)::int AS total,
              COALESCE(BOOL_OR(p.codigo = 'PREMIUM'
                               AND (f.planvencimiento IS NULL OR f.planvencimiento > now())), false) AS tiene_premium,
              (SELECT maxfincas FROM plan WHERE codigo = 'FREEMIUM') AS maxfincas
         FROM finca f JOIN plan p ON p.idplan = f.idplan
        WHERE f.idpropietario = $1 AND f.activo = true`,
      [user.idusuario],
    );
    if (!estado.tiene_premium && estado.maxfincas !== null && estado.total >= estado.maxfincas) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'LIMITE_PLAN_FINCAS',
        message: `El plan Freemium permite ${estado.maxfincas} finca(s). Actualiza a Premium para registrar más.`,
      });
    }

    try {
      const finca = await this.ds.transaction(async (m) => {
        const [plan] = await m.query(`SELECT idplan FROM plan WHERE codigo = 'FREEMIUM'`);
        if (!plan) throw new BadRequestException('Falta el plan FREEMIUM en la tabla plan (corre la migración)');

        const [creada] = await m.query(
          `INSERT INTO finca (nombre, ubicacion, latitud, longitud, tipoproduccion, idpropietario, idplan)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING idfinca, nombre, ubicacion, tipoproduccion`,
          [
            dto.nombre.trim(),
            dto.ubicacion ?? null,
            dto.latitud ?? null,
            dto.longitud ?? null,
            dto.tipoproduccion ?? null,
            user.idusuario,
            plan.idplan,
          ],
        );
        await m.query(
          `INSERT INTO finca_usuario (idfinca, idusuario, rol) VALUES ($1, $2, 'admin')`,
          [creada.idfinca, user.idusuario],
        );
        await m.query(
          `INSERT INTO suscripcion (idfinca, idplan, estado) VALUES ($1, $2, 'ACTIVA')`,
          [creada.idfinca, plan.idplan],
        );
        return creada;
      });

      // La finca recién creada queda como activa en el token que se devuelve
      const token = this.tokens.sign({
        idusuario: user.idusuario,
        email: user.email,
        rol: 'admin',
        idfinca: finca.idfinca,
      });
      return { finca: { ...finca, rol: 'admin', plan: 'FREEMIUM' }, token };
    } catch (err) {
      if (esViolacionUnica(err)) {
        throw new ConflictException('Ya tienes una finca con ese nombre. Elige otro.');
      }
      throw err;
    }
  }

  // ── CU-36 · Seleccionar finca activa ──────────────────────────────────────
  async seleccionar(idfinca: number, user: AuthUser) {
    this.exigirOnline();
    const [fila] = await this.ds.query(
      `SELECT f.idfinca, f.nombre, f.ubicacion, f.tipoproduccion, fu.rol, p.codigo AS plan
         FROM finca_usuario fu
         JOIN finca f ON f.idfinca = fu.idfinca
         JOIN plan  p ON p.idplan  = f.idplan
        WHERE fu.idusuario = $1 AND fu.idfinca = $2 AND fu.activo = true AND f.activo = true`,
      [user.idusuario, idfinca],
    );
    // Mismo mensaje exista o no la finca: no se revela qué ids existen
    if (!fila) throw new ForbiddenException('No tienes acceso a esa finca');

    const token = this.tokens.sign({
      idusuario: user.idusuario,
      email: user.email,
      rol: fila.rol as Rol,
      idfinca: fila.idfinca,
    });
    return { token, finca: fila as FincaResumen };
  }

  // ── Finca activa ──────────────────────────────────────────────────────────
  async detalle(idfinca: number) {
    const finca = await this.fincaRepo.findOne({ where: { idfinca }, relations: ['plan'] });
    if (!finca) throw new NotFoundException('Finca no encontrada');
    const plan = await this.planes.getPlan(idfinca);
    return { ...finca, planEfectivo: plan };
  }

  async actualizar(idfinca: number, dto: UpdateFincaDto) {
    try {
      const res = await this.fincaRepo.update({ idfinca }, dto as any);
      if (!res.affected) throw new NotFoundException('Finca no encontrada');
    } catch (err) {
      if (esViolacionUnica(err)) throw new ConflictException('Ya tienes una finca con ese nombre.');
      throw err;
    }
    return this.fincaRepo.findOneBy({ idfinca });
  }

  // ── CU-37 · Dashboard Central (todas mis fincas, datos aislados por finca) ─
  async dashboard(user: AuthUser) {
    this.exigirOnline();
    const rows = await this.ds.query(
      `SELECT f.idfinca, f.nombre, f.ubicacion, f.tipoproduccion, p.codigo AS plan,
              (SELECT COUNT(*)::int FROM cultivo c WHERE c.idfinca = f.idfinca) AS cultivos,
              (SELECT COUNT(*)::int FROM tarea t WHERE t.idfinca = f.idfinca AND t.estado ILIKE 'pendiente%') AS tareas_pendientes,
              (SELECT COUNT(*)::int FROM tarea t WHERE t.idfinca = f.idfinca AND t.estado ILIKE 'en progreso%') AS tareas_en_progreso,
              (SELECT COUNT(*)::int FROM tarea t WHERE t.idfinca = f.idfinca AND t.estado ILIKE 'completad%') AS tareas_completadas,
              (SELECT COUNT(*)::int FROM insumo i WHERE i.idfinca = f.idfinca AND i.stockactual <= i.stockminimo) AS insumos_stock_bajo,
              (SELECT COUNT(*)::int FROM finca_usuario x WHERE x.idfinca = f.idfinca AND x.activo = true) AS miembros,
              (SELECT COALESCE(SUM(o.subtotal), 0)::float8 FROM orden_compra o
                WHERE o.idfinca = f.idfinca AND o.estado = 'CERRADA') AS ventas_marketplace
         FROM finca_usuario m
         JOIN finca f ON f.idfinca = m.idfinca
         JOIN plan  p ON p.idplan  = f.idplan
        WHERE m.idusuario = $1 AND m.rol = 'admin' AND m.activo = true AND f.activo = true
        ORDER BY f.nombre`,
      [user.idusuario],
    );
    return rows;
  }

  // ── Miembros ──────────────────────────────────────────────────────────────
  async listarMiembros(idfinca: number) {
    return this.ds.query(
      `SELECT u.idusuario, u.primernombre, u.segundonombre, u.primerapellido, u.segundoapellido,
              u.email, u.telefono, u.cedula, u.fotoperfil, fu.rol, fu.activo, fu.fechaingreso
         FROM finca_usuario fu
         JOIN usuario u ON u.idusuario = fu.idusuario
        WHERE fu.idfinca = $1
        ORDER BY fu.rol, u.primernombre`,
      [idfinca],
    );
  }

  async esMiembro(idfinca: number, idusuario: number, rol?: 'admin' | 'empleado'): Promise<boolean> {
    const rows = await this.ds.query(
      `SELECT 1 FROM finca_usuario
        WHERE idfinca = $1 AND idusuario = $2 AND activo = true AND ($3::text IS NULL OR rol = $3)`,
      [idfinca, idusuario, rol ?? null],
    );
    return rows.length > 0;
  }

  /** Límite de empleados del plan (RF-41). null = ilimitado. */
  async validarLimiteEmpleados(idfinca: number): Promise<void> {
    const plan = await this.planes.getPlan(idfinca);
    if (plan.maxempleados === null) return;
    const [{ total }] = await this.ds.query(
      `SELECT COUNT(*)::int AS total FROM finca_usuario
        WHERE idfinca = $1 AND rol = 'empleado' AND activo = true`,
      [idfinca],
    );
    if (total >= plan.maxempleados) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'LIMITE_PLAN_EMPLEADOS',
        message: `El plan ${plan.codigo === 'FREEMIUM' ? 'Freemium' : plan.codigo} permite hasta ${plan.maxempleados} empleados. Actualiza a Premium.`,
      });
    }
  }

  /**
   * Agrega (o reactiva) a un usuario en la finca. Si el usuario ya pertenece a OTRA finca
   * solo se admite cuando el propio usuario lo acepta (Talent Center); un administrador
   * no puede "robar" usuarios de otras fincas por id.
   */
  async agregarMiembro(
    idfinca: number,
    idusuario: number,
    rol: 'admin' | 'empleado',
    opciones: { manager?: EntityManager; permitirDeOtraFinca?: boolean } = {},
  ): Promise<void> {
    const manager = opciones.manager ?? this.ds.manager;

    if (!opciones.permitirDeOtraFinca) {
      const [{ en_otras }] = await manager.query(
        `SELECT COUNT(*)::int AS en_otras FROM finca_usuario WHERE idusuario = $1 AND idfinca <> $2`,
        [idusuario, idfinca],
      );
      if (en_otras > 0) {
        throw new ForbiddenException('Ese usuario ya pertenece a otra finca');
      }
    }
    if (rol === 'empleado') await this.validarLimiteEmpleados(idfinca);

    await manager.query(
      `INSERT INTO finca_usuario (idfinca, idusuario, rol) VALUES ($1, $2, $3)
       ON CONFLICT (idfinca, idusuario) DO UPDATE SET activo = true, rol = EXCLUDED.rol`,
      [idfinca, idusuario, rol],
    );
  }

  /** Desactiva la membresía. El propietario de la finca no puede ser removido. */
  async quitarMiembro(idfinca: number, idusuario: number): Promise<void> {
    this.exigirOnline();
    const finca = await this.fincaRepo.findOneBy({ idfinca });
    if (!finca) throw new NotFoundException('Finca no encontrada');
    if (finca.idpropietario === idusuario) {
      throw new ForbiddenException('No se puede remover al propietario de la finca');
    }
    const res = await this.miembroRepo.update({ idfinca, idusuario }, { activo: false });
    if (!res.affected) throw new NotFoundException('El usuario no pertenece a esta finca');
    this.sesiones.invalidar(idusuario);
  }

  async cambiarEstadoMiembro(idfinca: number, idusuario: number, activo: boolean): Promise<void> {
    if (!activo) return this.quitarMiembro(idfinca, idusuario);
    const res = await this.miembroRepo.update({ idfinca, idusuario }, { activo: true });
    if (!res.affected) throw new NotFoundException('El usuario no pertenece a esta finca');
    this.sesiones.invalidar(idusuario);
  }

  /** ¿La finca tiene a este usuario (activo o no) con ese rol? Para validar ids que manda el cliente. */
  async exigirMiembro(
    idfinca: number,
    idusuario: number,
    rol: 'admin' | 'empleado',
    etiqueta: string,
  ): Promise<void> {
    if (!(await this.esMiembro(idfinca, idusuario, rol))) {
      throw new NotFoundException(`${etiqueta} no pertenece a esta finca`);
    }
  }

  /** Atajo para servicios que solo necesitan los ids de las filas. */
  async idsDeMiembros(idfinca: number, rol: 'admin' | 'empleado'): Promise<number[]> {
    const rows = filas<{ idusuario: number }>(
      await this.ds.query(
        `SELECT idusuario FROM finca_usuario WHERE idfinca = $1 AND rol = $2 AND activo = true`,
        [idfinca, rol],
      ),
    );
    return rows.map((r) => r.idusuario);
  }
}
