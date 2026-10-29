import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { filas } from '../../common/sql';
import { TareaEvidenciaService } from './tarea-evidencia.service';
import { COSTO_TAREA_SQL, FilaCosto, armarCosto } from './costos';
import { costoHoraDeFinca } from './mano-obra';
import { fechaColombia } from '../plantillas/fechas';
import { Tarea } from '../../Entidades/entities/Tarea';
import { Empleado } from '../../Entidades/entities/Empleado';
import { Cultivo } from '../../Entidades/entities/Cultivo';
import { AsignacionTarea } from '../../Entidades/entities/AsignacionTarea';
import {
  CreateTareaDto,
  UpdateTareaDto,
  AsignarTareaDto,
} from '../../dto/tarea.dto';
import { MailService } from '../../mail/mail.service';
import { CacheService } from '../../common/cache.service';
import { Insumo } from '../../Entidades/entities/Insumo';
import { DetalleTarea } from '../../Entidades/entities/DetalleTarea';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { TenantContext } from '../../auth/tenant-context';

/** Lo recolectado en una tarea de cosecha. */
export interface DatosCosecha {
  cantidad: number;
  unidad?: string | null;
  calidad?: string | null;
}

@Injectable()
export class TareasService {
  private readonly logger = new Logger(TareasService.name);

  constructor(
    @InjectRepository(Tarea) private repo: Repository<Tarea>,
    @InjectRepository(Empleado) private empleadoRepo: Repository<Empleado>,
    @InjectRepository(AsignacionTarea)
    private asignacionRepo: Repository<AsignacionTarea>,
    @InjectRepository(Insumo) private insumoRepo: Repository<Insumo>,
    @InjectRepository(DetalleTarea)
    private detalleRepo: Repository<DetalleTarea>,
    private mailService: MailService,
    private cache: CacheService,
    private offlineQueue: OfflineQueueService,
    private sync: SyncService,
    @Optional() private evidencias?: TareaEvidenciaService,
  ) {}

  // ── Multi-tenant ──────────────────────────────────────────────────────────

  private get idfinca(): number {
    return TenantContext.requireFinca();
  }

  /**
   * Clave de caché de esta finca. Los empleados llevan además su id porque sus listas
   * vienen filtradas (solo sus tareas) y no deben mezclarse con las del administrador.
   */
  private k(sufijo: string): string {
    const u = TenantContext.user();
    const tag = !u
      ? 'f0'
      : u.idfinca === null
        ? `u${u.idusuario}`
        : u.rol === 'empleado'
          ? `f${u.idfinca}e${u.idusuario}`
          : `f${u.idfinca}`;
    return `tareas_${tag}_${sufijo}`;
  }

  /** Caché de empleados de la finca (la precarga SyncService; la vista del administrador). */
  private claveEmpleados(): string {
    return `empleado_f${this.idfinca}_all`;
  }

  /** Consulta base: solo tareas de la finca activa; el empleado, solo las que tiene asignadas (CU-09). */
  private baseQuery() {
    const qb = this.repo
      .createQueryBuilder('tarea')
      .leftJoinAndSelect('tarea.idadmincreador', 'admin')
      .leftJoinAndSelect('tarea.idcultivo', 'cultivo')
      .leftJoinAndSelect('tarea.asignacionTareas', 'asig')
      .leftJoinAndSelect('asig.idempleado', 'empleado')
      .leftJoinAndSelect('empleado.idusuario2', 'usuario')
      .where('tarea.idfinca = :f', { f: this.idfinca });

    const u = TenantContext.requireUser();
    if (u.rol === 'empleado') {
      qb.andWhere('empleado.idusuario = :uid', { uid: u.idusuario });
    }
    return qb;
  }

  /** El empleado solo puede operar sobre tareas que le asignaron. */
  private async exigirAsignada(
    idtarea: number,
    idusuario: number,
  ): Promise<void> {
    const total = await this.asignacionRepo.count({
      where: {
        idfinca: this.idfinca,
        idtarea: idtarea as any,
        idempleado: idusuario as any,
      },
    });
    if (total === 0)
      throw new ForbiddenException('Esta tarea no te fue asignada');
  }

  private async exigirEmpleadoDeFinca(idempleado: number): Promise<void> {
    const r = await this.repo.manager.query(
      `SELECT 1 FROM finca_usuario WHERE idfinca = $1 AND idusuario = $2 AND rol = 'empleado' AND activo = true`,
      [this.idfinca, idempleado],
    );
    if (!r.length)
      throw new NotFoundException(
        `Empleado #${idempleado} no pertenece a esta finca.`,
      );
  }

  /** Una tarea de cosecha necesita cultivo: sin él, lo recolectado no tiene a qué cosecha pertenecer. */
  private exigirCultivoSiEsCosecha(actividad?: string | null, idcultivo?: number | null) {
    if (actividad && /cosecha/i.test(actividad) && !idcultivo) {
      throw new BadRequestException('Una tarea de cosecha necesita un cultivo: elige a cuál pertenece lo que se recolecte');
    }
  }

  /** CU-07 / RNF-05: el cultivo debe ser de la finca, estar activo y la fecha no puede ser previa a la siembra. */
  private async validarCultivo(
    idcultivo?: number | null,
    fechaprogramada?: string | null,
  ): Promise<void> {
    if (!idcultivo) return;
    const cultivo = await this.repo.manager
      .getRepository(Cultivo)
      .findOneBy({ idcultivo, idfinca: this.idfinca });
    if (!cultivo)
      throw new NotFoundException('El cultivo no existe en esta finca');
    if (cultivo.activo === false)
      throw new BadRequestException('El cultivo no está activo');
    if (
      fechaprogramada &&
      cultivo.fechasiembra &&
      new Date(fechaprogramada) < new Date(cultivo.fechasiembra)
    ) {
      throw new BadRequestException(
        'La tarea no puede programarse antes de la fecha de siembra del cultivo',
      );
    }
  }

  // ── findAll ───────────────────────────────────────────────────────────────
  async findAll() {
    const CACHE_KEY = this.k('all');
    const online = await this.sync.isOnline();

    if (!online) {
      this.logger.warn('📴 Sin internet — devolviendo tareas desde caché');
      return this.cache.get<Tarea[]>(CACHE_KEY) ?? [];
    }

    const tareas = await this.baseQuery().getMany();

    // Fotos de evidencia ya subidas por tarea (el frontend las muestra como ícono en las listas).
    const conteo = new Map<number, number>();
    const ids = tareas.map((t) => t.idtarea);
    if (ids.length > 0) {
      const filas: { idtarea: number; n: number }[] =
        await this.repo.manager.query(
          `SELECT idtarea, COUNT(*)::int AS n FROM tarea_evidencia WHERE idfinca = $1 AND idtarea = ANY($2) GROUP BY idtarea`,
          [this.idfinca, ids],
        );
      for (const f of filas) conteo.set(f.idtarea, f.n);
    }

    const pending = (this.cache.get<any[]>(CACHE_KEY) ?? []).filter(
      (t) => t._offline === true,
    );
    const supabaseIds = new Set(tareas.map((t) => String(t.idtarea)));
    const soloOffline = pending.filter(
      (t) => !supabaseIds.has(String(t.idtarea)),
    );
    const merged = [
      ...tareas.map((t) => ({ ...t, evidencias: conteo.get(t.idtarea) ?? 0 })),
      ...soloOffline,
    ];

    this.cache.set(CACHE_KEY, merged);
    return merged;
  }

  // ── findOne ───────────────────────────────────────────────────────────────
  async findOne(id: number) {
    const CACHE_KEY = this.k(String(id));
    const online = await this.sync.isOnline();

    if (!online) {
      this.logger.warn(
        `📴 Sin internet — devolviendo tarea #${id} desde caché`,
      );
      return this.cache.get<Tarea>(CACHE_KEY) ?? null;
    }

    const tarea = await this.baseQuery()
      .andWhere('tarea.idtarea = :id', { id })
      .getOne();

    if (tarea) this.cache.set(CACHE_KEY, tarea);
    return tarea;
  }

  // ── findByEstado ──────────────────────────────────────────────────────────
  async findByEstado(estado: string) {
    const CACHE_KEY = this.k(`estado_${estado}`);
    const online = await this.sync.isOnline();

    if (!online) {
      this.logger.warn(
        `📴 Sin internet — devolviendo tareas estado "${estado}" desde caché`,
      );
      return this.cache.get<Tarea[]>(CACHE_KEY) ?? [];
    }

    const tareas = await this.baseQuery()
      .andWhere('tarea.estado = :estado', { estado })
      .getMany();
    this.cache.set(CACHE_KEY, tareas);
    return tareas;
  }

  // ── create ────────────────────────────────────────────────────────────────
  async create(dto: CreateTareaDto) {
    const online = await this.sync.isOnline();
    // La finca y el creador salen de la sesión, nunca del cuerpo de la petición
    const datos = {
      ...dto,
      idfinca: this.idfinca,
      idadmincreador: TenantContext.requireUser().idusuario,
    };

    this.exigirCultivoSiEsCosecha(dto.tipoactividad, dto.idcultivo);

    if (online) {
      await this.validarCultivo(dto.idcultivo, dto.fechaprogramada);
      const entity = this.repo.create({
        ...datos,
        idadmincreador: { idusuario: datos.idadmincreador } as any,
        idcultivo: dto.idcultivo
          ? ({ idcultivo: dto.idcultivo } as any)
          : undefined,
      });
      const saved = await this.repo.save(entity);
      const all = this.cache.get<Tarea[]>(this.k('all')) ?? [];
      this.cache.set(this.k('all'), [...all, saved]);
      return saved;
    }

    const tempId = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let _nombreEmpleado: string | null = null;
    if ((dto as any).idempleado) {
      const empleados: any[] =
        this.cache.get<any[]>(this.claveEmpleados()) ?? [];
      const emp = empleados.find(
        (e: any) => e.idusuario === (dto as any).idempleado,
      );
      if (emp?.idusuario2) {
        _nombreEmpleado = [
          emp.idusuario2.primernombre,
          emp.idusuario2.primerapellido,
        ]
          .filter(Boolean)
          .join(' ');
      } else if (emp?.primernombre) {
        _nombreEmpleado = [emp.primernombre, emp.primerapellido]
          .filter(Boolean)
          .join(' ');
      }
    }

    const tempEntity = {
      idtarea: tempId,
      ...datos,
      _offline: true,
      _pendiente: 'CREATE',
      _nombreEmpleado,
    };
    const all = this.cache.get<any[]>(this.k('all')) ?? [];
    this.cache.set(this.k('all'), [...all, tempEntity]);

    const datosSinCamposExtra = Object.fromEntries(
      Object.entries(datos).filter(([k]) => k !== 'idempleado'),
    );
    this.offlineQueue.add('tarea', 'CREATE', datosSinCamposExtra);
    this.logger.log(`📥 Tarea guardada offline (id temporal: ${tempId})`);

    return {
      ...tempEntity,
      _mensaje:
        'Guardado localmente. Se subirá a Supabase cuando haya internet.',
    };
  }

  // ── update ────────────────────────────────────────────────────────────────
  async update(id: number, dto: UpdateTareaDto) {
    const user = TenantContext.requireUser();
    const idfinca = this.idfinca;

    // Nunca se acepta cambiar la finca ni el creador desde el cliente
    let cambios: Record<string, any> = { ...dto };
    delete cambios.idfinca;
    delete cambios.idadmincreador;

    // CU-10: el empleado solo puede cambiar el ESTADO de las tareas que le asignaron
    if (user.rol === 'empleado') {
      if (dto.estado === undefined) {
        throw new ForbiddenException(
          'Un empleado solo puede actualizar el estado de sus tareas',
        );
      }
      cambios = { estado: dto.estado };
    }

    const online = await this.sync.isOnline();

    if (online) {
      const entity = await this.repo.findOneBy({ idtarea: id, idfinca });
      if (!entity) throw new NotFoundException(`Tarea #${id} no encontrada.`);

      if (user.rol === 'empleado') {
        await this.exigirAsignada(id, user.idusuario);
        if (entity.estado === 'Completado' && cambios.estado !== 'Completado') {
          throw new BadRequestException('La tarea ya está completada');
        }
      }

      if (cambios.tipoactividad !== undefined && /cosecha/i.test(String(cambios.tipoactividad)) && !cambios.idcultivo) {
        const [actual] = await this.repo.manager.query(`SELECT idcultivo FROM tarea WHERE idtarea = $1 AND idfinca = $2`, [id, idfinca]);
        this.exigirCultivoSiEsCosecha(String(cambios.tipoactividad), actual?.idcultivo);
      }

      if (cambios.idcultivo !== undefined || cambios.fechaprogramada !== undefined) {
        await this.validarCultivo(
          cambios.idcultivo ?? undefined,
          cambios.fechaprogramada ?? entity.fechaprogramada,
        );
      }

      Object.assign(entity, {
        ...cambios,
        idcultivo: cambios.idcultivo
          ? ({ idcultivo: cambios.idcultivo } as any)
          : entity.idcultivo,
      });
      const saved = await this.repo.save(entity);
      this.cache.set(this.k(String(id)), saved);
      const all = (this.cache.get<any[]>(this.k('all')) ?? []).map((t) =>
        t.idtarea === id ? saved : t,
      );
      this.cache.set(this.k('all'), all);
      return saved;
    }

    const cached = this.cache.get<any>(this.k(String(id)));
    const updated = {
      ...(cached ?? { idtarea: id }),
      ...cambios,
      _pendiente: 'UPDATE',
    };
    this.cache.set(this.k(String(id)), updated);
    const all = (this.cache.get<any[]>(this.k('all')) ?? []).map((t) =>
      t.idtarea === id ? updated : t,
    );
    this.cache.set(this.k('all'), all);
    // idfinca viaja en la cola: al sincronizar solo se actualiza la fila de ESA finca
    this.offlineQueue.add('tarea', 'UPDATE', {
      idtarea: id,
      ...cambios,
      idfinca,
    });
    this.logger.log(`📥 Tarea #${id} actualizada offline`);
    return {
      ...updated,
      _mensaje:
        'Actualizado localmente. Se subirá a Supabase cuando haya internet.',
    };
  }

  // ── remove ────────────────────────────────────────────────────────────────
  async remove(id: number) {
    const online = await this.sync.isOnline();
    const idfinca = this.idfinca;

    if (online) {
      try {
        const res = await this.repo.delete({ idtarea: id, idfinca });
        if (!res.affected)
          throw new NotFoundException(`Tarea #${id} no encontrada.`);
      } catch (err: any) {
        // RNF-06: no se borra lo que tiene registros dependientes
        if (err?.code === '23503') {
          throw new ConflictException(
            `No se puede eliminar la tarea #${id}: tiene registros asociados.`,
          );
        }
        throw err;
      }
      this.cache.delete(this.k(String(id)));
      const all = (this.cache.get<any[]>(this.k('all')) ?? []).filter(
        (t) => t.idtarea !== id,
      );
      this.cache.set(this.k('all'), all);
      return { message: 'Tarea eliminada' };
    }

    this.cache.delete(this.k(String(id)));
    const all = (this.cache.get<any[]>(this.k('all')) ?? []).filter(
      (t) => t.idtarea !== id,
    );
    this.cache.set(this.k('all'), all);
    this.offlineQueue.add('tarea', 'DELETE', { idtarea: id, idfinca });
    this.logger.log(`📥 Tarea #${id} marcada para eliminar offline`);
    return {
      message:
        'Eliminado localmente. Se borrará de Supabase cuando haya internet.',
    };
  }

  // ── asignar ───────────────────────────────────────────────────────────────
  async asignar(
    idTarea: number,
    dto: AsignarTareaDto,
  ): Promise<AsignacionTarea | any> {
    const online = await this.sync.isOnline();
    const admin = TenantContext.requireUser();
    const idfinca = this.idfinca;
    const origen = dto.origenasignacion === 'sugerida' ? 'sugerida' : 'manual';

    if (online) {
      const tarea = await this.repo.findOne({
        where: { idtarea: idTarea, idfinca },
        relations: ['idcultivo', 'idcultivo.idlote'],
      });
      if (!tarea)
        throw new NotFoundException(`Tarea #${idTarea} no encontrada.`);

      await this.exigirEmpleadoDeFinca(dto.idempleado);
      const empleado = await this.empleadoRepo.findOne({
        where: { idusuario: dto.idempleado },
        relations: ['idusuario2'],
      });
      if (!empleado)
        throw new NotFoundException(
          `Empleado #${dto.idempleado} no encontrado.`,
        );

      let asignacion = await this.asignacionRepo
        .createQueryBuilder('a')
        .leftJoinAndSelect('a.idtarea', 'tarea')
        .leftJoinAndSelect('a.idempleado', 'empleado')
        .leftJoinAndSelect('a.idadminasignador', 'admin')
        .where('a.idfinca = :f', { f: idfinca })
        .andWhere('tarea.idtarea = :idTarea', { idTarea })
        .andWhere('empleado.idusuario = :idEmp', { idEmp: dto.idempleado })
        .getOne();

      if (asignacion) {
        Object.assign(asignacion, {
          estado: dto.estado ?? asignacion.estado,
          pagoacordado: dto.pagoacordado ?? asignacion.pagoacordado,
          fechaasignacion: dto.fechaasignacion ?? asignacion.fechaasignacion,
          idadminasignador: { idusuario: admin.idusuario } as any,
        });
      } else {
        asignacion = this.asignacionRepo.create({
          idfinca,
          fechaasignacion:
            dto.fechaasignacion ?? new Date().toISOString().split('T')[0],
          estado: dto.estado ?? 'Asignado',
          pagoacordado: dto.pagoacordado ?? null,
          origenasignacion: origen,
          idtarea: { idtarea: idTarea } as any,
          idempleado: { idusuario: dto.idempleado } as any,
          idadminasignador: { idusuario: admin.idusuario } as any,
        });
      }

      const saved = await this.asignacionRepo.save(asignacion);

      // Reasignar: las asignaciones abiertas de otros empleados quedan como "Reasignada" (se conserva
      // su historial y las horas ya trabajadas) para no dejar la tarea esperando a quien ya no la hace.
      if (dto.reemplazar) {
        await this.asignacionRepo
          .createQueryBuilder()
          .update(AsignacionTarea)
          .set({ estado: 'Reasignada' })
          .where(
            'idfinca = :f AND idtarea = :t AND idasigtarea <> :a AND estado IS DISTINCT FROM :c',
            {
              f: idfinca,
              t: idTarea,
              a: saved.idasigtarea,
              c: 'Completado',
            },
          )
          .execute();
      }

      await this.notificar(
        dto.idempleado,
        'Nueva tarea asignada',
        `Te asignaron: ${tarea.tipoactividad ?? 'una tarea'}`,
        'tarea_asignada',
        idTarea,
      );

      // ── Email al empleado ────────────────────────────────────────────────
      const emailEmpleado = empleado.idusuario2?.email ?? '';
      if (emailEmpleado) {
        await this.mailService.notificarTareaAsignada(emailEmpleado, {
          nombreTarea: tarea.tipoactividad ?? 'Sin nombre',
          fechaProgramada: tarea.fechaprogramada ?? null,
          pagoacordado: dto.pagoacordado ?? null,
        });
      }

      // ── Stock y correo admin ─────────────────────────────────────────────
      try {
        const detalles = await this.detalleRepo
          .createQueryBuilder('detalle')
          .leftJoinAndSelect('detalle.idinsumo', 'insumo')
          .where('detalle.idfinca = :f', { f: idfinca })
          .andWhere('detalle.idtarea = :idTarea', { idTarea })
          .getMany();

        // El administrador que asigna es quien tiene la sesión
        const emailAdmin = admin.email ?? '';
        this.logger.log(`👤 Admin a notificar: "${emailAdmin}"`);
        this.logger.log(`📦 Insumos en tarea #${idTarea}: ${detalles.length}`);

        for (const detalle of detalles) {
          if (!detalle.idinsumo || !detalle.cantidadusada) continue;

          // Query directa a BD — lee stock actual sin caché
          const [insumoFresco] = await this.repo.manager.query(
            `SELECT idinsumo, nombre, stockactual, stockminimo, unidadmedida, tipo
               FROM insumo WHERE idinsumo = $1 AND idfinca = $2`,
            [detalle.idinsumo.idinsumo, idfinca],
          );
          if (!insumoFresco) continue;

          const stockActual = Number(insumoFresco.stockactual ?? 0);
          const stockMinimo = Number(insumoFresco.stockminimo ?? 0);
          const cantidadUsada = Number(detalle.cantidadusada ?? 0);

          this.logger.log(
            `📦 "${insumoFresco.nombre}": stock actual ${stockActual} (mín: ${stockMinimo})`,
          );

          // ── NO descuenta — detalle_tareaService ya lo hizo ───────────────────
          // Solo verifica si está bajo y manda correo
          if (stockActual <= stockMinimo) {
            if (emailAdmin) {
              this.logger.log(
                `⚠️ Stock bajo: "${insumoFresco.nombre}" (${stockActual} ≤ ${stockMinimo}) → email a ${emailAdmin}`,
              );
              await this.mailService.notificarStockBajo(emailAdmin, {
                nombreInsumo: insumoFresco.nombre ?? 'Sin nombre',
                tipo: insumoFresco.tipo ?? null,
                stockActual: stockActual,
                stockMinimo: stockMinimo,
                unidadMedida: insumoFresco.unidadmedida ?? null,
                cantidadUsada: cantidadUsada,
              });
            } else {
              this.logger.warn(
                `⚠️ Stock bajo en "${insumoFresco.nombre}" pero no hay email de admin`,
              );
            }
          }
        }
      } catch (err) {
        this.logger.error(`❌ Error verificando stock: ${err.message}`);
      }

      return this.asignacionRepo.findOneOrFail({
        where: { idasigtarea: saved.idasigtarea, idfinca },
        relations: [
          'idtarea',
          'idempleado',
          'idempleado.idusuario2',
          'idadminasignador',
        ],
      });
    }

    // ── Modo offline ──────────────────────────────────────────────────────────
    let nombreEmpleado = '—';
    const empleadosCache: any[] =
      this.cache.get<any[]>(this.claveEmpleados()) ?? [];
    const empCache = empleadosCache.find(
      (e: any) => e.idusuario === dto.idempleado,
    );
    if (empCache?.idusuario2) {
      nombreEmpleado = [
        empCache.idusuario2.primernombre,
        empCache.idusuario2.primerapellido,
      ]
        .filter(Boolean)
        .join(' ');
    } else if (empCache?.primernombre) {
      nombreEmpleado = [empCache.primernombre, empCache.primerapellido]
        .filter(Boolean)
        .join(' ');
    }

    const tareasAll: any[] = this.cache.get<any[]>(this.k('all')) ?? [];
    const tareasActualizadas = tareasAll.map((t: any) => {
      if (t.idtarea !== idTarea) return t;
      const asigSimulada = {
        _offline: true,
        idempleado: {
          idusuario: dto.idempleado,
          idusuario2: empCache?.idusuario2 ?? {
            primernombre: empCache?.primernombre ?? '—',
            primerapellido: empCache?.primerapellido ?? '',
          },
        },
        estado: dto.estado ?? 'Asignado',
        pagoacordado: dto.pagoacordado ?? null,
        fechaasignacion:
          dto.fechaasignacion ?? new Date().toISOString().split('T')[0],
      };
      return {
        ...t,
        _nombreEmpleado: nombreEmpleado,
        asignacionTareas: [...(t.asignacionTareas ?? []), asigSimulada],
      };
    });

    this.cache.set(this.k('all'), tareasActualizadas);
    const { reemplazar: _reemplazar, ...dtoCola } = dto; // no es una columna de asignacion_tarea
    this.offlineQueue.add('asignacion_tarea', 'CREATE', {
      idtarea: idTarea,
      ...dtoCola,
      origenasignacion: origen,
      idadminasignador: admin.idusuario,
      idfinca,
    });
    this.logger.log(
      `📥 Asignación tarea #${idTarea} encolada offline — empleado: ${nombreEmpleado}`,
    );

    return {
      _offline: true,
      idtarea: idTarea,
      ...dto,
      estado: dto.estado ?? 'Asignado',
      fechaasignacion:
        dto.fechaasignacion ?? new Date().toISOString().split('T')[0],
      _nombreEmpleado: nombreEmpleado,
      _mensaje:
        'Asignación guardada localmente. Se subirá cuando haya internet.',
    };
  }

  // ── tiempos reales: iniciar / completar ───────────────────────────────────

  /**
   * Instante en que ocurrió la acción. Si el celular estaba sin red, el cliente manda la hora
   * en que realmente se pulsó el botón; se descarta si es futura o absurdamente antigua.
   */
  private instante(at?: string | Date | null): Date {
    const ahora = new Date();
    if (!at) return ahora;
    const d = new Date(at);
    if (isNaN(d.getTime())) return ahora;
    if (d.getTime() > ahora.getTime() + 5 * 60_000) return ahora;
    if (d.getTime() < ahora.getTime() - 14 * 24 * 3_600_000) return ahora;
    return d;
  }

  private async asignacionPropia(
    idAsignacion: number,
  ): Promise<AsignacionTarea> {
    const user = TenantContext.requireUser();
    const asignacion = await this.asignacionRepo.findOne({
      where: { idasigtarea: idAsignacion, idfinca: this.idfinca },
      relations: [
        'idtarea',
        'idempleado',
        'idempleado.idusuario2',
        'idadminasignador',
        'idadminasignador.idusuario2',
      ],
    });
    if (!asignacion)
      throw new NotFoundException(`Asignación #${idAsignacion} no encontrada.`);
    // Un empleado solo opera SUS asignaciones
    if (
      user.rol === 'empleado' &&
      asignacion.idempleado?.idusuario !== user.idusuario
    ) {
      throw new ForbiddenException('Esta asignación no es tuya');
    }
    return asignacion;
  }

  /** Marca el inicio real del trabajo (queda la hora); la tarea pasa a "En progreso". */
  async iniciar(
    idAsignacion: number,
    at?: string | null,
  ): Promise<AsignacionTarea> {
    const asignacion = await this.asignacionPropia(idAsignacion);
    if (asignacion.estado === 'Completado') {
      throw new BadRequestException('La asignación ya está completada');
    }

    const inicio = this.instante(at);
    asignacion.estado = 'En progreso';
    asignacion.fechainicio = asignacion.fechainicio ?? inicio; // reanudar no pisa la hora original
    await this.asignacionRepo.save(asignacion);

    if (asignacion.idtarea) {
      const idtarea = asignacion.idtarea.idtarea;
      await this.repo.update(
        { idtarea, idfinca: this.idfinca },
        { estado: 'En progreso' },
      );
      // Primera vez que alguien empieza esta tarea
      if (!asignacion.idtarea.fechainicio) {
        await this.repo.update(
          { idtarea, idfinca: this.idfinca },
          { fechainicio: inicio },
        );
      }
      this.cache.delete(this.k(String(idtarea)));
    }
    this.cache.delete(this.k('all'));
    return asignacion;
  }

  /** Aviso dentro de la app para una persona. Nunca interrumpe la operación que lo origina. */
  private async notificar(
    idusuario: number | null | undefined,
    titulo: string,
    mensaje: string,
    tipo: string,
    idtarea: number,
  ) {
    if (!idusuario) return;
    try {
      await this.repo.manager.query(
        `INSERT INTO notificacion (idfinca, idusuariodestino, titulo, mensaje, tipo, tabla_origen, idregistro)
         VALUES ($1, $2, $3, $4, $5, 'tarea', $6)`,
        [this.idfinca, idusuario, titulo, mensaje, tipo, idtarea],
      );
    } catch (err: any) {
      this.logger.warn(
        `No se pudo crear la notificación (${tipo}): ${err?.message}`,
      );
    }
  }

  /** Costo real de la tarea: insumos usados + mano de obra (horas trabajadas × costo por hora de la finca) + transporte. */
  private async calcularCostoReal(idtarea: number): Promise<number> {
    const consulta = (q: string, par?: any[]) =>
      this.repo.manager.query(q, par);
    const [r] = filas<FilaCosto>(
      await consulta(COSTO_TAREA_SQL, [idtarea, this.idfinca]),
    );
    return armarCosto(r, await costoHoraDeFinca(consulta, this.idfinca)).total;
  }

  // ── completar ─────────────────────────────────────────────────────────────
  // notificarTareaCompletada sigue recibiendo 3 argumentos (emailAdmin, nombreTarea, nombreEmpleado).
  async completar(
    idAsignacion: number,
    at?: string | null,
    cosecha?: DatosCosecha | null,
  ): Promise<AsignacionTarea> {
    const datosCosecha = this.validarCosecha(cosecha);
    const asignacion = await this.asignacionPropia(idAsignacion);
    if (datosCosecha && asignacion.idtarea) {
      const [t] = await this.repo.manager.query(
        `SELECT idcultivo FROM tarea WHERE idtarea = $1 AND idfinca = $2`, [asignacion.idtarea.idtarea, this.idfinca],
      );
      if (!t?.idcultivo) {
        throw new BadRequestException('Esta tarea no tiene cultivo: edítala y elígelo para poder registrar lo recolectado');
      }
    }
    const fin = this.instante(at);

    // Actualizar asignación; si hubo cronómetro, las horas salen solas (la edición manual manda)
    asignacion.estado = 'Completado';
    asignacion.fechafin = asignacion.fechafin ?? fin;
    if (asignacion.fechainicio && !asignacion.horastrabajadas) {
      const horas =
        (fin.getTime() - new Date(asignacion.fechainicio).getTime()) /
        3_600_000;
      asignacion.horastrabajadas = Math.round(Math.max(horas, 0) * 100) / 100;
    }
    await this.asignacionRepo.save(asignacion);

    // La tarea solo se completa cuando TODAS sus asignaciones terminaron
    if (asignacion.idtarea) {
      const idtarea = asignacion.idtarea.idtarea;
      const pendientes = await this.asignacionRepo.count({
        where: {
          idfinca: this.idfinca,
          idtarea: idtarea as any,
          estado: Not(In(['Completado', 'Reasignada'])),
        },
      });
      if (!pendientes) {
        await this.repo.update(
          { idtarea, idfinca: this.idfinca },
          { estado: 'Completado' },
        );
        try {
          const costoreal = await this.calcularCostoReal(idtarea);
          await this.repo.update(
            { idtarea, idfinca: this.idfinca },
            { fechafin: fin, costoreal },
          );
        } catch (err: any) {
          this.logger.warn(
            `No se pudo calcular el costo real de la tarea #${idtarea}: ${err.message}`,
          );
        }
      }
    }

    // Tarea de cosecha: lo recolectado queda en el módulo de cosechas, ligado a la tarea y a quien lo recogió
    if (datosCosecha)
      await this.registrarCosecha(asignacion, fin, datosCosecha);

    // Aviso dentro de la app para quien asignó
    await this.notificar(
      asignacion.idadminasignador?.idusuario,
      'Tarea completada',
      `${asignacion.idempleado?.idusuario2?.primernombre ?? 'Un empleado'} completó: ${asignacion.idtarea?.tipoactividad ?? 'una tarea'}`,
      'tarea_completada',
      asignacion.idtarea?.idtarea ?? 0,
    );

    // Email al admin
    const emailAdmin = asignacion.idadminasignador?.idusuario2?.email ?? '';
    const nombreEmpleado =
      asignacion.idempleado?.idusuario2?.primernombre ?? 'Empleado';
    const nombreTarea = asignacion.idtarea?.tipoactividad ?? 'Sin nombre';

    if (emailAdmin) {
      await this.mailService.notificarTareaCompletada(
        emailAdmin,
        nombreTarea,
        nombreEmpleado,
      );
    }

    // Invalidar caché para que el frontend vea el cambio
    this.cache.delete(this.k(String(asignacion.idtarea?.idtarea)));
    this.cache.delete(this.k('all'));

    return asignacion;
  }

  /** Cantidad obtenida en una tarea de cosecha (la enviada por la app, ya normalizada). */
  private validarCosecha(c?: DatosCosecha | null): DatosCosecha | null {
    if (
      !c ||
      c.cantidad === undefined ||
      c.cantidad === null ||
      (c.cantidad as unknown) === ''
    )
      return null;
    const cantidad = Number(c.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new BadRequestException(
        'La cantidad cosechada debe ser un número mayor que cero',
      );
    }
    return {
      cantidad,
      unidad: (c.unidad ?? 'kg').toString().trim().slice(0, 20) || 'kg',
      calidad: c.calidad ? c.calidad.toString().trim().slice(0, 50) : null,
    };
  }

  private async registrarCosecha(
    asignacion: AsignacionTarea,
    fin: Date,
    c: DatosCosecha,
  ) {
    const idtarea = asignacion.idtarea?.idtarea;
    if (!idtarea) return;
    try {
      await this.repo.manager.query(
        `INSERT INTO cosecha (idfinca, idcultivo, fechacosecha, cantidad, unidad, calidad, observaciones, idadminregistro, idtarea, idempleado)
         SELECT t.idfinca, t.idcultivo, $3::date, $4, $5, $6, $7, $8, t.idtarea, $9
           FROM tarea t WHERE t.idtarea = $1 AND t.idfinca = $2 AND t.idcultivo IS NOT NULL`,
        [
          idtarea,
          this.idfinca,
          fechaColombia(fin),
          c.cantidad,
          c.unidad,
          c.calidad ?? null,
          `Tarea #${idtarea}: ${asignacion.idtarea?.tipoactividad ?? 'cosecha'}`,
          asignacion.idadminasignador?.idusuario ?? null,
          asignacion.idempleado?.idusuario ?? null,
        ],
      );
    } catch (err: any) {
      // La tarea ya quedó completada; la cosecha se puede registrar a mano en Producción › Cosechas
      this.logger.error(
        `No se pudo registrar la cosecha de la tarea #${idtarea}: ${err?.message}`,
      );
    }
  }

  async completarConEvidencia(
    idTarea: number,
    body: any,
    fotoPath: string | null,
  ) {
    const user = TenantContext.requireUser();
    if (user.rol !== 'empleado') {
      throw new ForbiddenException(
        'Solo el trabajador asignado puede enviar evidencia fotográfica',
      );
    }
    if (!fotoPath || !body?.idasigtarea) {
      throw new BadRequestException(
        'La evidencia requiere una foto y una asignación de tarea',
      );
    }

    // Del cliente solo se acepta lo que escribe la persona (observaciones), la asignación y la hora
    // real del toque; actividad, fecha, empleado y lote salen de la base de datos.
    const { observaciones, idasigtarea, at } = body;
    // La cantidad cosechada viaja como campos del formulario multipart
    const cosecha: DatosCosecha | null = body.cosecha_cantidad
      ? {
          cantidad: Number(String(body.cosecha_cantidad).replace(',', '.')),
          unidad: body.cosecha_unidad,
          calidad: body.cosecha_calidad,
        }
      : null;

    const tarea = await this.repo.findOne({
      where: { idtarea: idTarea, idfinca: this.idfinca },
      relations: [
        'idcultivo',
        'idcultivo.idlote',
        'idadmincreador',
        'idadmincreador.idusuario2',
      ],
    });
    if (!tarea) throw new NotFoundException(`Tarea #${idTarea} no encontrada.`);

    // 1. Completar la asignación (o la tarea, si no tiene asignación)
    let idEmpleado = TenantContext.requireUser().idusuario;
    if (idasigtarea) {
      const asig = await this.asignacionRepo.findOne({
        where: { idasigtarea: Number(idasigtarea), idfinca: this.idfinca },
        relations: ['idtarea', 'idempleado'],
      });
      if (!asig || asig.idtarea?.idtarea !== idTarea) {
        throw new BadRequestException(
          'La asignación no corresponde a esta tarea',
        );
      }
      if (asig.idempleado?.idusuario !== user.idusuario) {
        throw new ForbiddenException(
          'Solo el trabajador asignado puede completar la tarea con evidencia',
        );
      }
      idEmpleado = asig.idempleado?.idusuario ?? idEmpleado;
      await this.completar(Number(idasigtarea), at, cosecha);
    } else {
      await this.update(idTarea, { estado: 'Completado' } as any);
    }

    // 2. Datos del reporte desde la BD
    const [u] = filas<{ nombre: string }>(
      await this.repo.manager.query(
        `SELECT trim(concat_ws(' ', primernombre, primerapellido)) AS nombre FROM usuario WHERE idusuario = $1`,
        [idEmpleado],
      ),
    );
    const nombreEmpleado = u?.nombre || 'Empleado';
    const tipoactividad = tarea.tipoactividad ?? 'Sin nombre';
    const fechaprogramada = tarea.fechaprogramada ?? '';
    const lote = [tarea.idcultivo?.idlote?.nombre, tarea.idcultivo?.tipo]
      .filter(Boolean)
      .join(' · ');

    const pdfBuffer = await this.generarPDF({
      idtarea: idTarea,
      tipoactividad,
      fechaprogramada,
      nombreEmpleado,
      lote,
      observaciones,
      fotoPath,
    });

    // 3. Email del admin que creó la tarea
    const emailAdmin = tarea.idadmincreador?.idusuario2?.email ?? '';

    // 4. Enviar correo con el PDF adjunto
    if (emailAdmin) {
      await this.mailService.notificarTareaCompletadaConEvidencia(
        emailAdmin,
        idTarea,
        tipoactividad,
        nombreEmpleado,
        lote,
        fechaprogramada,
        observaciones,
        pdfBuffer,
      );
    }

    // 5. Guardar la foto en la tarea (si falla, la tarea igual queda completada y el correo ya salió)
    if (fotoPath && this.evidencias) {
      try {
        await this.evidencias.registrar(
          this.idfinca,
          idTarea,
          TenantContext.requireUser(),
          fotoPath,
          {
            observaciones,
            idasigtarea: idasigtarea ? Number(idasigtarea) : null,
          },
        );
      } catch (err: any) {
        this.logger.warn(
          `No se pudo guardar la evidencia de la tarea #${idTarea}: ${err?.message}`,
        );
      }
    }

    // 6. Limpiar foto temporal
    if (fotoPath) {
      const fs = await import('fs');
      fs.unlink(fotoPath, () => {});
    }

    return { ok: true, message: 'Tarea completada y correo enviado.' };
  }

  private async generarPDF({
    idtarea,
    tipoactividad,
    fechaprogramada,
    nombreEmpleado,
    lote,
    observaciones,
    fotoPath,
  }: any): Promise<Buffer> {
    const PDFDocument = (await import('pdfkit')).default;
    const fs = await import('fs');

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc
        .fillColor('#16a34a')
        .fontSize(22)
        .font('Helvetica-Bold')
        .text('AgroSmart', 50, 50);
      doc
        .fillColor('#374151')
        .fontSize(13)
        .font('Helvetica')
        .text('Reporte de Tarea Completada', 50, 78);
      doc
        .moveTo(50, 98)
        .lineTo(545, 98)
        .strokeColor('#e5e7eb')
        .lineWidth(1)
        .stroke();

      const campo = (label: string, valor: string, y: number) => {
        doc
          .fillColor('#6b7280')
          .fontSize(10)
          .font('Helvetica')
          .text(label, 50, y);
        doc
          .fillColor('#111827')
          .fontSize(11)
          .font('Helvetica-Bold')
          .text(valor || '—', 180, y);
      };

      const s = 115;
      const lh = 22;
      campo('ID de Tarea', `#${idtarea}`, s);
      campo('Actividad', tipoactividad, s + lh);
      campo('Fecha programada', fechaprogramada, s + lh * 2);
      campo('Empleado', nombreEmpleado, s + lh * 3);
      campo('Lote / Cultivo', lote, s + lh * 4);
      campo(
        'Fecha completada',
        new Date().toLocaleDateString('es-CO'),
        s + lh * 5,
      );

      const obsY = s + lh * 7;
      doc
        .fillColor('#374151')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('Observaciones', 50, obsY);
      doc
        .moveTo(50, obsY + 16)
        .lineTo(545, obsY + 16)
        .strokeColor('#e5e7eb')
        .lineWidth(0.5)
        .stroke();
      doc
        .fillColor('#374151')
        .fontSize(11)
        .font('Helvetica')
        .text(observaciones?.trim() || 'Sin observaciones.', 50, obsY + 24, {
          width: 495,
        });

      const imgY = (doc as any).y + 28;
      doc
        .fillColor('#374151')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('Evidencia fotográfica', 50, imgY);
      doc
        .moveTo(50, imgY + 16)
        .lineTo(545, imgY + 16)
        .strokeColor('#e5e7eb')
        .lineWidth(0.5)
        .stroke();

      if (fotoPath && fs.existsSync(fotoPath)) {
        try {
          doc.image(fotoPath, 50, imgY + 26, {
            fit: [495, 320],
            align: 'center',
          });
        } catch {
          doc
            .fillColor('#9ca3af')
            .fontSize(10)
            .text('No se pudo incrustar la imagen.', 50, imgY + 30);
        }
      } else {
        doc
          .fillColor('#9ca3af')
          .fontSize(10)
          .font('Helvetica')
          .text('Sin imagen adjunta.', 50, imgY + 30);
      }

      doc
        .fillColor('#9ca3af')
        .fontSize(9)
        .font('Helvetica')
        .text(
          `Generado por AgroSmart · ${new Date().toLocaleString('es-CO')}`,
          50,
          doc.page.height - 50,
          { align: 'center', width: 495 },
        );

      doc.end();
    });
  }
}
