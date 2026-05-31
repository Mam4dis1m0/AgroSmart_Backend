// src/Modules/tareas/tareas.service.ts
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tarea } from '../../Entidades/entities/Tarea';
import { Empleado } from '../../Entidades/entities/Empleado';
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

  // ── findAll ───────────────────────────────────────────────────────────────
  async findAll() {
    const CACHE_KEY = 'tareas_all';
    const online = await this.sync.isOnline();

    if (!online) {
      this.logger.warn('📴 Sin internet — devolviendo tareas desde caché');
      return this.cache.get<Tarea[]>(CACHE_KEY) ?? [];
    }

    const tareas = await this.repo
      .createQueryBuilder('tarea')
      .leftJoinAndSelect('tarea.idadmincreador', 'admin')
      .leftJoinAndSelect('tarea.idcultivo', 'cultivo')
      .leftJoinAndSelect('tarea.asignacionTareas', 'asig')
      .leftJoinAndSelect('asig.idempleado', 'empleado')
      .leftJoinAndSelect('empleado.idusuario2', 'usuario')
      .getMany();

    // Mezcla tareas de Supabase con pendientes offline del caché
    const pending = (this.cache.get<any[]>(CACHE_KEY) ?? []).filter(
      (t) => t._offline === true,
    );
    const supabaseIds = new Set(tareas.map((t) => String(t.idtarea)));
    const soloOffline = pending.filter(
      (t) => !supabaseIds.has(String(t.idtarea)),
    );
    const merged = [...tareas, ...soloOffline];

    this.cache.set(CACHE_KEY, merged);
    return merged;
  }

  // ── findOne ───────────────────────────────────────────────────────────────
  async findOne(id: number) {
    const CACHE_KEY = `tareas_${id}`;
    const online = await this.sync.isOnline();

    if (!online) {
      this.logger.warn(
        `📴 Sin internet — devolviendo tarea #${id} desde caché`,
      );
      return this.cache.get<Tarea>(CACHE_KEY) ?? null;
    }

    const tarea = await this.repo.findOne({
      where: { idtarea: id },
      relations: [
        'idadmincreador',
        'idcultivo',
        'asignacionTareas',
        'asignacionTareas.idempleado',
        'asignacionTareas.idempleado.idusuario2',
      ],
    });

    if (tarea) this.cache.set(CACHE_KEY, tarea);
    return tarea;
  }

  // ── findByEstado ──────────────────────────────────────────────────────────
  async findByEstado(estado: string) {
    const CACHE_KEY = `tareas_estado_${estado}`;
    const online = await this.sync.isOnline();

    if (!online) {
      this.logger.warn(
        `📴 Sin internet — devolviendo tareas estado "${estado}" desde caché`,
      );
      return this.cache.get<Tarea[]>(CACHE_KEY) ?? [];
    }

    const tareas = await this.repo.find({
      where: { estado },
      relations: ['idadmincreador', 'idcultivo'],
    });
    this.cache.set(CACHE_KEY, tareas);
    return tareas;
  }

  // ── create ────────────────────────────────────────────────────────────────
  async create(dto: CreateTareaDto) {
    const online = await this.sync.isOnline();

    if (online) {
      const entity = this.repo.create({
        ...dto,
        idadmincreador: dto.idadmincreador
          ? ({ idusuario: dto.idadmincreador } as any)
          : undefined,
        idcultivo: dto.idcultivo
          ? ({ idcultivo: dto.idcultivo } as any)
          : undefined,
      });
      const saved = await this.repo.save(entity);
      const all = this.cache.get<Tarea[]>('tareas_all') ?? [];
      this.cache.set('tareas_all', [...all, saved]);
      return saved;
    }

    // ── Modo offline ──────────────────────────────────────────────────────
    const tempId = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    let _nombreEmpleado: string | null = null;
    if ((dto as any).idempleado) {
      const empleados: any[] = this.cache.get<any[]>('empleado_all') ?? [];
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
      ...dto,
      _offline: true,
      _pendiente: 'CREATE',
      _nombreEmpleado,
    };
    const all = this.cache.get<any[]>('tareas_all') ?? [];
    this.cache.set('tareas_all', [...all, tempEntity]);

    const dtoSinCamposExtra = Object.fromEntries(
      Object.entries(dto).filter(([k]) => k !== 'idempleado'),
    );
    this.offlineQueue.add('tarea', 'CREATE', dtoSinCamposExtra);
    this.logger.log(`📥 Tarea guardada offline (id temporal: ${tempId})`);

    return {
      ...tempEntity,
      _mensaje:
        'Guardado localmente. Se subirá a Supabase cuando haya internet.',
    };
  }

  // ── update ────────────────────────────────────────────────────────────────
  async update(id: number, dto: UpdateTareaDto) {
    const online = await this.sync.isOnline();

    if (online) {
      const entity = await this.repo.findOneByOrFail({ idtarea: id });
      Object.assign(entity, {
        ...dto,
        idadmincreador: dto.idadmincreador
          ? ({ idusuario: dto.idadmincreador } as any)
          : entity.idadmincreador,
        idcultivo: dto.idcultivo
          ? ({ idcultivo: dto.idcultivo } as any)
          : entity.idcultivo,
      });
      const saved = await this.repo.save(entity);
      this.cache.set(`tareas_${id}`, saved);
      const all = (this.cache.get<any[]>('tareas_all') ?? []).map((t) =>
        t.idtarea === id ? saved : t,
      );
      this.cache.set('tareas_all', all);
      return saved;
    }

    const cached = this.cache.get<any>(`tareas_${id}`);
    const updated = {
      ...(cached ?? { idtarea: id }),
      ...dto,
      _pendiente: 'UPDATE',
    };
    this.cache.set(`tareas_${id}`, updated);
    const all = (this.cache.get<any[]>('tareas_all') ?? []).map((t) =>
      t.idtarea === id ? updated : t,
    );
    this.cache.set('tareas_all', all);
    this.offlineQueue.add('tarea', 'UPDATE', { idtarea: id, ...dto });
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

    if (online) {
      await this.repo.delete(id);
      this.cache.delete(`tareas_${id}`);
      const all = (this.cache.get<any[]>('tareas_all') ?? []).filter(
        (t) => t.idtarea !== id,
      );
      this.cache.set('tareas_all', all);
      return { message: 'Tarea eliminada' };
    }

    this.cache.delete(`tareas_${id}`);
    const all = (this.cache.get<any[]>('tareas_all') ?? []).filter(
      (t) => t.idtarea !== id,
    );
    this.cache.set('tareas_all', all);
    this.offlineQueue.add('tarea', 'DELETE', { idtarea: id });
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

    if (online) {
      const tarea = await this.repo.findOne({
        where: { idtarea: idTarea },
        relations: ['idadmincreador', 'idadmincreador.idusuario2'],
      });
      if (!tarea)
        throw new NotFoundException(`Tarea #${idTarea} no encontrada.`);

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
        .where('tarea.idtarea = :idTarea', { idTarea })
        .andWhere('empleado.idusuario = :idEmp', { idEmp: dto.idempleado })
        .getOne();

      const esNueva = !asignacion;
      if (asignacion) {
        Object.assign(asignacion, {
          estado: dto.estado ?? asignacion.estado,
          pagoacordado: dto.pagoacordado ?? asignacion.pagoacordado,
          fechaasignacion: dto.fechaasignacion ?? asignacion.fechaasignacion,
          idadminasignador: { idusuario: dto.idadminasignador } as any,
        });
      } else {
        asignacion = this.asignacionRepo.create({
          fechaasignacion:
            dto.fechaasignacion ?? new Date().toISOString().split('T')[0],
          estado: dto.estado ?? 'Asignado',
          pagoacordado: dto.pagoacordado ?? null,
          idtarea: { idtarea: idTarea } as any,
          idempleado: { idusuario: dto.idempleado } as any,
          idadminasignador: { idusuario: dto.idadminasignador } as any,
        });
      }

      const saved = await this.asignacionRepo.save(asignacion);
      // ── Email al empleado ─────────────────────────────────────────────────
      const emailEmpleado = empleado.idusuario2?.email ?? '';
      console.log('Email empleado:', emailEmpleado);
      if (emailEmpleado) {
        await this.mailService.notificarTareaAsignada(
          emailEmpleado,
          tarea.tipoactividad ?? 'Sin nombre',
        );
      }
      const emailAdmin = tarea.idadmincreador?.idusuario2?.email ?? '';
      // ── Descontar stock de insumos al asignar ────────────────────────────────
      const idTareaReal = tarea.idtarea;

      // DESPUÉS
      const detalles = await this.detalleRepo
        .createQueryBuilder('detalle')
        .leftJoinAndSelect('detalle.idinsumo', 'insumo')
        .where('detalle.idtarea = :idTarea', { idTarea: idTareaReal })
        .getMany();
      // ← solo descuenta si es asignación nueva
      if (esNueva) {
        const detalles = await this.detalleRepo
          .createQueryBuilder('detalle')
          .leftJoinAndSelect('detalle.idinsumo', 'insumo')
          .where('detalle.idtarea = :idTarea', { idTarea: idTareaReal })
          .getMany();

        console.log('Detalles encontrados:', detalles.length);
        console.log('emailAdmin:', tarea.idadmincreador?.idusuario2?.email);

        for (const detalle of detalles) {
          const insumo = detalle.idinsumo;
          if (!insumo || detalle.cantidadusada == null) continue;

          const nuevoStock =
            Number(insumo.stockactual ?? 0) - Number(detalle.cantidadusada);

          console.log('Insumo:', insumo.nombre);
          console.log('Stock actual:', insumo.stockactual);
          console.log('Nuevo stock:', nuevoStock);
          console.log('Stock mínimo:', insumo.stockminimo);
          console.log(
            '¿Baja del mínimo?:',
            nuevoStock <= Number(insumo.stockminimo ?? 0),
          );
          // ... resto igual
        }
      }
      for (const detalle of detalles) {
        const insumo = detalle.idinsumo;
        if (!insumo || detalle.cantidadusada == null) continue;

        const stockActual = Number(insumo.stockactual ?? 0);
        const cantidadUsada = Number(detalle.cantidadusada);
        const nuevoStock = stockActual - cantidadUsada;

        // ← validar antes de intentar actualizar
        if (nuevoStock < 0) {
          throw new Error(
            `Stock insuficiente para "${insumo.nombre}". Stock actual: ${stockActual}, cantidad requerida: ${cantidadUsada}`,
          );
        }

        await this.insumoRepo.update(insumo.idinsumo, {
          stockactual: nuevoStock,
          fechaultimaactualizacion: new Date().toISOString().split('T')[0],
        });

        const emailAdmin = tarea.idadmincreador?.idusuario2?.email ?? '';
        console.log(
          'nuevoStock:',
          nuevoStock,
          '| stockminimo:',
          insumo.stockminimo,
          '| emailAdmin:',
          emailAdmin,
        );

        if (nuevoStock <= Number(insumo.stockminimo ?? 0) && emailAdmin) {
          await this.mailService.notificarStockBajo(
            emailAdmin,
            insumo.nombre ?? 'Sin nombre',
            nuevoStock,
            Number(insumo.stockminimo ?? 0),
            insumo.unidadmedida ?? '',
          );
        }
      }
      // ─────────────────────────────────────────────────────────────────────────
      return this.asignacionRepo.findOneOrFail({
        where: { idasigtarea: saved.idasigtarea },
        relations: [
          'idtarea',
          'idempleado',
          'idempleado.idusuario2',
          'idadminasignador',
        ],
      });
    }

    // ── Modo offline ──────────────────────────────────────────────────────
    let nombreEmpleado = '—';
    const empleadosCache: any[] = this.cache.get<any[]>('empleado_all') ?? [];
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

    const tareasAll: any[] = this.cache.get<any[]>('tareas_all') ?? [];
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
    this.cache.set('tareas_all', tareasActualizadas);

    this.offlineQueue.add('asignacion_tarea', 'CREATE', {
      idtarea: idTarea,
      ...dto,
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

  // ── completar ─────────────────────────────────────────────────────────────
  async completar(idAsignacion: number): Promise<AsignacionTarea> {
    const asignacion = await this.asignacionRepo.findOneOrFail({
      where: { idasigtarea: idAsignacion },
      relations: [
        'idtarea',
        'idempleado',
        'idempleado.idusuario2',
        'idadminasignador',
        'idadminasignador.idusuario2',
      ],
    });

    asignacion.estado = 'Completado';
    await this.asignacionRepo.save(asignacion);

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

    return asignacion;
  }
}
