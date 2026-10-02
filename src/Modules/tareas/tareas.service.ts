import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  private async exigirAsignada(idtarea: number, idusuario: number): Promise<void> {
    const total = await this.asignacionRepo.count({
      where: { idfinca: this.idfinca, idtarea: idtarea as any, idempleado: idusuario as any },
    });
    if (total === 0) throw new ForbiddenException('Esta tarea no te fue asignada');
  }

  private async exigirEmpleadoDeFinca(idempleado: number): Promise<void> {
    const r = await this.repo.manager.query(
      `SELECT 1 FROM finca_usuario WHERE idfinca = $1 AND idusuario = $2 AND rol = 'empleado' AND activo = true`,
      [this.idfinca, idempleado],
    );
    if (!r.length) throw new NotFoundException(`Empleado #${idempleado} no pertenece a esta finca.`);
  }

  /** CU-07 / RNF-05: el cultivo debe ser de la finca, estar activo y la fecha no puede ser previa a la siembra. */
  private async validarCultivo(idcultivo?: number | null, fechaprogramada?: string | null): Promise<void> {
    if (!idcultivo) return;
    const cultivo = await this.repo.manager
      .getRepository(Cultivo)
      .findOneBy({ idcultivo, idfinca: this.idfinca });
    if (!cultivo) throw new NotFoundException('El cultivo no existe en esta finca');
    if (cultivo.activo === false) throw new BadRequestException('El cultivo no está activo');
    if (fechaprogramada && cultivo.fechasiembra && new Date(fechaprogramada) < new Date(cultivo.fechasiembra)) {
      throw new BadRequestException('La tarea no puede programarse antes de la fecha de siembra del cultivo');
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

    const pending = (this.cache.get<any[]>(CACHE_KEY) ?? []).filter(t => t._offline === true);
    const supabaseIds = new Set(tareas.map(t => String(t.idtarea)));
    const soloOffline = pending.filter(t => !supabaseIds.has(String(t.idtarea)));
    const merged = [...tareas, ...soloOffline];

    this.cache.set(CACHE_KEY, merged);
    return merged;
  }

  // ── findOne ───────────────────────────────────────────────────────────────
  async findOne(id: number) {
    const CACHE_KEY = this.k(String(id));
    const online = await this.sync.isOnline();

    if (!online) {
      this.logger.warn(`📴 Sin internet — devolviendo tarea #${id} desde caché`);
      return this.cache.get<Tarea>(CACHE_KEY) ?? null;
    }

    const tarea = await this.baseQuery().andWhere('tarea.idtarea = :id', { id }).getOne();

    if (tarea) this.cache.set(CACHE_KEY, tarea);
    return tarea;
  }

  // ── findByEstado ──────────────────────────────────────────────────────────
  async findByEstado(estado: string) {
    const CACHE_KEY = this.k(`estado_${estado}`);
    const online = await this.sync.isOnline();

    if (!online) {
      this.logger.warn(`📴 Sin internet — devolviendo tareas estado "${estado}" desde caché`);
      return this.cache.get<Tarea[]>(CACHE_KEY) ?? [];
    }

    const tareas = await this.baseQuery().andWhere('tarea.estado = :estado', { estado }).getMany();
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

    if (online) {
      await this.validarCultivo(dto.idcultivo, dto.fechaprogramada);
      const entity = this.repo.create({
        ...datos,
        idadmincreador: { idusuario: datos.idadmincreador } as any,
        idcultivo:      dto.idcultivo ? ({ idcultivo: dto.idcultivo } as any) : undefined,
      });
      const saved = await this.repo.save(entity);
      const all = this.cache.get<Tarea[]>(this.k('all')) ?? [];
      this.cache.set(this.k('all'), [...all, saved]);
      return saved;
    }

    const tempId = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let _nombreEmpleado: string | null = null;
    if ((dto as any).idempleado) {
      const empleados: any[] = this.cache.get<any[]>(this.claveEmpleados()) ?? [];
      const emp = empleados.find((e: any) => e.idusuario === (dto as any).idempleado);
      if (emp?.idusuario2) {
        _nombreEmpleado = [emp.idusuario2.primernombre, emp.idusuario2.primerapellido].filter(Boolean).join(' ');
      } else if (emp?.primernombre) {
        _nombreEmpleado = [emp.primernombre, emp.primerapellido].filter(Boolean).join(' ');
      }
    }

    const tempEntity = { idtarea: tempId, ...datos, _offline: true, _pendiente: 'CREATE', _nombreEmpleado };
    const all = this.cache.get<any[]>(this.k('all')) ?? [];
    this.cache.set(this.k('all'), [...all, tempEntity]);

    const datosSinCamposExtra = Object.fromEntries(Object.entries(datos).filter(([k]) => k !== 'idempleado'));
    this.offlineQueue.add('tarea', 'CREATE', datosSinCamposExtra);
    this.logger.log(`📥 Tarea guardada offline (id temporal: ${tempId})`);

    return { ...tempEntity, _mensaje: 'Guardado localmente. Se subirá a Supabase cuando haya internet.' };
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
        throw new ForbiddenException('Un empleado solo puede actualizar el estado de sus tareas');
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
    this.offlineQueue.add('tarea', 'UPDATE', { idtarea: id, ...cambios, idfinca });
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
        if (!res.affected) throw new NotFoundException(`Tarea #${id} no encontrada.`);
      } catch (err: any) {
        // RNF-06: no se borra lo que tiene registros dependientes
        if (err?.code === '23503') {
          throw new ConflictException(`No se puede eliminar la tarea #${id}: tiene registros asociados.`);
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
  async asignar(idTarea: number, dto: AsignarTareaDto): Promise<AsignacionTarea | any> {
    const online = await this.sync.isOnline();
    const admin = TenantContext.requireUser();
    const idfinca = this.idfinca;

    if (online) {
      const tarea = await this.repo.findOne({
        where: { idtarea: idTarea, idfinca },
        relations: ['idcultivo', 'idcultivo.idlote'],
      });
      if (!tarea) throw new NotFoundException(`Tarea #${idTarea} no encontrada.`);

      await this.exigirEmpleadoDeFinca(dto.idempleado);
      const empleado = await this.empleadoRepo.findOne({
        where: { idusuario: dto.idempleado },
        relations: ['idusuario2'],
      });
      if (!empleado) throw new NotFoundException(`Empleado #${dto.idempleado} no encontrado.`);

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
          estado:           dto.estado           ?? asignacion.estado,
          pagoacordado:     dto.pagoacordado      ?? asignacion.pagoacordado,
          fechaasignacion:  dto.fechaasignacion   ?? asignacion.fechaasignacion,
          idadminasignador: { idusuario: admin.idusuario } as any,
        });
      } else {
        asignacion = this.asignacionRepo.create({
          idfinca,
          fechaasignacion:  dto.fechaasignacion ?? new Date().toISOString().split('T')[0],
          estado:           dto.estado          ?? 'Asignado',
          pagoacordado:     dto.pagoacordado    ?? null,
          idtarea:          { idtarea: idTarea }                as any,
          idempleado:       { idusuario: dto.idempleado }       as any,
          idadminasignador: { idusuario: admin.idusuario }      as any,
        });
      }

      const saved = await this.asignacionRepo.save(asignacion);

      // ── Email al empleado ────────────────────────────────────────────────
      const emailEmpleado = empleado.idusuario2?.email ?? '';
      if (emailEmpleado) {
        await this.mailService.notificarTareaAsignada(emailEmpleado, {
          nombreTarea:     tarea.tipoactividad    ?? 'Sin nombre',
          fechaProgramada: tarea.fechaprogramada  ?? null,
          pagoacordado:    dto.pagoacordado       ?? null,
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
                nombreInsumo:  insumoFresco.nombre      ?? 'Sin nombre',
                tipo:          insumoFresco.tipo         ?? null,
                stockActual:   stockActual,
                stockMinimo:   stockMinimo,
                unidadMedida:  insumoFresco.unidadmedida ?? null,
                cantidadUsada: cantidadUsada,
              });
            } else {
              this.logger.warn(`⚠️ Stock bajo en "${insumoFresco.nombre}" pero no hay email de admin`);
            }
          }
        }
      } catch (err) {
        this.logger.error(`❌ Error verificando stock: ${err.message}`);
      }

      return this.asignacionRepo.findOneOrFail({
        where: { idasigtarea: saved.idasigtarea, idfinca },
        relations: ['idtarea', 'idempleado', 'idempleado.idusuario2', 'idadminasignador'],
      });
    }

    // ── Modo offline ──────────────────────────────────────────────────────────
    let nombreEmpleado = '—';
    const empleadosCache: any[] = this.cache.get<any[]>(this.claveEmpleados()) ?? [];
    const empCache = empleadosCache.find((e: any) => e.idusuario === dto.idempleado);
    if (empCache?.idusuario2) {
      nombreEmpleado = [empCache.idusuario2.primernombre, empCache.idusuario2.primerapellido]
        .filter(Boolean).join(' ');
    } else if (empCache?.primernombre) {
      nombreEmpleado = [empCache.primernombre, empCache.primerapellido]
        .filter(Boolean).join(' ');
    }

    const tareasAll: any[] = this.cache.get<any[]>(this.k('all')) ?? [];
    const tareasActualizadas = tareasAll.map((t: any) => {
      if (t.idtarea !== idTarea) return t;
      const asigSimulada = {
        _offline: true,
        idempleado: {
          idusuario: dto.idempleado,
          idusuario2: empCache?.idusuario2 ?? {
            primernombre:   empCache?.primernombre   ?? '—',
            primerapellido: empCache?.primerapellido ?? '',
          },
        },
        estado:          dto.estado          ?? 'Asignado',
        pagoacordado:    dto.pagoacordado    ?? null,
        fechaasignacion: dto.fechaasignacion ?? new Date().toISOString().split('T')[0],
      };
      return {
        ...t,
        _nombreEmpleado:  nombreEmpleado,
        asignacionTareas: [...(t.asignacionTareas ?? []), asigSimulada],
      };
    });

    this.cache.set(this.k('all'), tareasActualizadas);
    this.offlineQueue.add('asignacion_tarea', 'CREATE', {
      idtarea: idTarea,
      ...dto,
      idadminasignador: admin.idusuario,
      idfinca,
    });
    this.logger.log(`📥 Asignación tarea #${idTarea} encolada offline — empleado: ${nombreEmpleado}`);

    return {
      _offline:        true,
      idtarea:         idTarea,
      ...dto,
      estado:          dto.estado          ?? 'Asignado',
      fechaasignacion: dto.fechaasignacion ?? new Date().toISOString().split('T')[0],
      _nombreEmpleado: nombreEmpleado,
      _mensaje:        'Asignación guardada localmente. Se subirá cuando haya internet.',
    };
  }

  // ── completar ─────────────────────────────────────────────────────────────
  // ERROR 3 CORREGIDO: notificarTareaCompletada sigue recibiendo 3 argumentos
  // (emailAdmin, nombreTarea, nombreEmpleado) — no se cambió su firma.
  async completar(idAsignacion: number): Promise<AsignacionTarea> {
    const user = TenantContext.requireUser();
    const asignacion = await this.asignacionRepo.findOne({
      where: { idasigtarea: idAsignacion, idfinca: this.idfinca },
      relations: ['idtarea', 'idempleado', 'idempleado.idusuario2', 'idadminasignador', 'idadminasignador.idusuario2'],
    });
    if (!asignacion) throw new NotFoundException(`Asignación #${idAsignacion} no encontrada.`);

    // Un empleado solo completa SUS asignaciones
    if (user.rol === 'empleado' && asignacion.idempleado?.idusuario !== user.idusuario) {
      throw new ForbiddenException('Esta asignación no es tuya');
    }

    // Actualizar asignación
    asignacion.estado = 'Completado';
    await this.asignacionRepo.save(asignacion);

    // 🔥 ACTUALIZAR LA TAREA PRINCIPAL (esto es lo que faltaba)
    if (asignacion.idtarea) {
      await this.repo.update(
        { idtarea: asignacion.idtarea.idtarea, idfinca: this.idfinca },
        { estado: 'Completado' },
      );
    }

    // Email al admin
    const emailAdmin = asignacion.idadminasignador?.idusuario2?.email ?? '';
    const nombreEmpleado = asignacion.idempleado?.idusuario2?.primernombre ?? 'Empleado';
    const nombreTarea = asignacion.idtarea?.tipoactividad ?? 'Sin nombre';

    if (emailAdmin) {
      await this.mailService.notificarTareaCompletada(emailAdmin, nombreTarea, nombreEmpleado);
    }

    // Invalidar caché para que el frontend vea el cambio
    this.cache.delete(this.k(String(asignacion.idtarea?.idtarea)));
    this.cache.delete(this.k('all'));

    return asignacion;
  }

  async completarConEvidencia(idTarea: number, body: any, fotoPath: string | null) {
    const {
      observaciones, tipoactividad, fechaprogramada,
      nombreEmpleado, lote, idasigtarea,
    } = body;

    // 1. Completar la asignación o la tarea
    if (idasigtarea) {
      await this.completar(Number(idasigtarea));
    } else {
      await this.update(idTarea, { estado: 'Completado' } as any);
    }

    // 2. Generar PDF
    const pdfBuffer = await this.generarPDF({
      idtarea: idTarea, tipoactividad, fechaprogramada,
      nombreEmpleado, lote, observaciones, fotoPath,
    });

    // 3. Obtener email del admin desde la tarea
    const tareaConAdmin = await this.repo.findOne({
      where: { idtarea: idTarea, idfinca: this.idfinca },
      relations: ['idadmincreador', 'idadmincreador.idusuario2'],
    });
    const emailAdmin = tareaConAdmin?.idadmincreador?.idusuario2?.email ?? '';

    // 4. Enviar correo con el PDF adjunto
    if (emailAdmin) {
      await this.mailService.notificarTareaCompletadaConEvidencia(
        emailAdmin, idTarea, tipoactividad, nombreEmpleado,
        lote, fechaprogramada, observaciones, pdfBuffer,
      );
    }

    // 5. Limpiar foto temporal
    if (fotoPath) {
      const fs = await import('fs');
      fs.unlink(fotoPath, () => {});
    }

    return { ok: true, message: 'Tarea completada y correo enviado.' };
  }

private async generarPDF({ idtarea, tipoactividad, fechaprogramada, nombreEmpleado, lote, observaciones, fotoPath }: any): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default;
  const fs = await import('fs');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fillColor('#16a34a').fontSize(22).font('Helvetica-Bold').text('AgroSmart', 50, 50);
    doc.fillColor('#374151').fontSize(13).font('Helvetica').text('Reporte de Tarea Completada', 50, 78);
    doc.moveTo(50, 98).lineTo(545, 98).strokeColor('#e5e7eb').lineWidth(1).stroke();

    const campo = (label: string, valor: string, y: number) => {
      doc.fillColor('#6b7280').fontSize(10).font('Helvetica').text(label, 50, y);
      doc.fillColor('#111827').fontSize(11).font('Helvetica-Bold').text(valor || '—', 180, y);
    };

    const s = 115; const lh = 22;
    campo('ID de Tarea',      `#${idtarea}`,          s);
    campo('Actividad',        tipoactividad,           s + lh);
    campo('Fecha programada', fechaprogramada,         s + lh * 2);
    campo('Empleado',         nombreEmpleado,          s + lh * 3);
    campo('Lote / Cultivo',   lote,                    s + lh * 4);
    campo('Fecha completada', new Date().toLocaleDateString('es-CO'), s + lh * 5);

    const obsY = s + lh * 7;
    doc.fillColor('#374151').fontSize(12).font('Helvetica-Bold').text('Observaciones', 50, obsY);
    doc.moveTo(50, obsY + 16).lineTo(545, obsY + 16).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
    doc.fillColor('#374151').fontSize(11).font('Helvetica').text(observaciones?.trim() || 'Sin observaciones.', 50, obsY + 24, { width: 495 });

    const imgY = (doc as any).y + 28;
    doc.fillColor('#374151').fontSize(12).font('Helvetica-Bold').text('Evidencia fotográfica', 50, imgY);
    doc.moveTo(50, imgY + 16).lineTo(545, imgY + 16).strokeColor('#e5e7eb').lineWidth(0.5).stroke();

    if (fotoPath && fs.existsSync(fotoPath)) {
      try {
        doc.image(fotoPath, 50, imgY + 26, { fit: [495, 320], align: 'center' });
      } catch { doc.fillColor('#9ca3af').fontSize(10).text('No se pudo incrustar la imagen.', 50, imgY + 30); }
    } else {
      doc.fillColor('#9ca3af').fontSize(10).font('Helvetica').text('Sin imagen adjunta.', 50, imgY + 30);
    }

    doc.fillColor('#9ca3af').fontSize(9).font('Helvetica')
      .text(`Generado por AgroSmart · ${new Date().toLocaleString('es-CO')}`, 50, doc.page.height - 50, { align: 'center', width: 495 });

    doc.end();
  });
}
}