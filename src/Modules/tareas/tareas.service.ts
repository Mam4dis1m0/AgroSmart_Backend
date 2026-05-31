// src/Modules/tareas/tareas.service.ts
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tarea } from '../../Entidades/entities/Tarea';
import { Empleado } from '../../Entidades/entities/Empleado';
import { AsignacionTarea } from '../../Entidades/entities/AsignacionTarea';
import { CreateTareaDto, UpdateTareaDto, AsignarTareaDto } from '../../dto/tarea.dto';
import { MailService } from '../../mail/mail.service';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';

import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
@Injectable()
export class TareasService {
  private readonly logger = new Logger(TareasService.name);

  constructor(
    @InjectRepository(Tarea)           private repo: Repository<Tarea>,
    @InjectRepository(Empleado)        private empleadoRepo: Repository<Empleado>,
    @InjectRepository(AsignacionTarea) private asignacionRepo: Repository<AsignacionTarea>,
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

  this.cache.set(CACHE_KEY, tareas);
return tareas;
}

  // ── findOne ───────────────────────────────────────────────────────────────
  async findOne(id: number) {
    const CACHE_KEY = `tareas_${id}`;
    const online = await this.sync.isOnline();

    if (!online) {
      this.logger.warn(`📴 Sin internet — devolviendo tarea #${id} desde caché`);
      return this.cache.get<Tarea>(CACHE_KEY) ?? null;
    }

    const tarea = await this.repo.findOne({
      where: { idtarea: id },
      relations: ['idadmincreador', 'idcultivo', 'asignacionTareas', 'asignacionTareas.idempleado', 'asignacionTareas.idempleado.idusuario2'],
    });

    if (tarea) this.cache.set(CACHE_KEY, tarea);
    return tarea;
  }

  // ── findByEstado ──────────────────────────────────────────────────────────
  async findByEstado(estado: string) {
    const CACHE_KEY = `tareas_estado_${estado}`;
    const online = await this.sync.isOnline();

    if (!online) {
      this.logger.warn(`📴 Sin internet — devolviendo tareas estado "${estado}" desde caché`);
      return this.cache.get<Tarea[]>(CACHE_KEY) ?? [];
    }

    const tareas = await this.repo.find({ where: { estado }, relations: ['idadmincreador', 'idcultivo'] });
    this.cache.set(CACHE_KEY, tareas);
    return tareas;
  }

  // ── create ────────────────────────────────────────────────────────────────
  async create(dto: CreateTareaDto) {
    const online = await this.sync.isOnline();

    if (online) {
      const entity = this.repo.create({
        ...dto,
        idadmincreador: dto.idadmincreador ? ({ idusuario: dto.idadmincreador } as any) : undefined,
        idcultivo:      dto.idcultivo      ? ({ idcultivo: dto.idcultivo }      as any) : undefined,
      });
      const saved = await this.repo.save(entity);
      const all = this.cache.get<Tarea[]>('tareas_all') ?? [];
      this.cache.set('tareas_all', [...all, saved]);
      return saved;
    }

    // ── Modo offline ────────────────────────────────────────────────────────
    const tempId = -(Date.now() % 1_000_000);

    let _nombreEmpleado: string | null = null;
    if ((dto as any).idempleado) {
      const empleados: any[] = this.cache.get<any[]>('empleado_all') ?? [];
      const emp = empleados.find((e: any) => e.idusuario === (dto as any).idempleado);
      if (emp?.idusuario2) {
        _nombreEmpleado = [emp.idusuario2.primernombre, emp.idusuario2.primerapellido]
          .filter(Boolean).join(' ');
      } else if (emp?.primernombre) {
        _nombreEmpleado = [emp.primernombre, emp.primerapellido]
          .filter(Boolean).join(' ');
      }
    }

    const tempEntity = {
      idtarea:         tempId,
      tipoactividad:   dto.tipoactividad,
      fechaprogramada: (dto as any).fechaprogramada ?? null,
      estado:          (dto as any).estado          ?? 'Pendiente',
      esrecurrente:    (dto as any).esrecurrente    ?? 'No',
      costototal:      (dto as any).costototal       ?? 0,
      asignacionTareas: _nombreEmpleado ? [{
        idasigtarea: -1,
        estado: 'Asignado',
        idempleado: {
          idusuario: (dto as any).idempleado ?? 0,
          idusuario2: {
            primernombre:   _nombreEmpleado.split(' ')[0] ?? '',
            primerapellido: _nombreEmpleado.split(' ').slice(1).join(' ') ?? '',
          },
        },
      }] : [],
      _offline:        true,
      _pendiente:      'CREATE',
      _nombreEmpleado,
    };

    const all = this.cache.get<any[]>('tareas_all') ?? [];
    this.cache.set('tareas_all', [...all, tempEntity]);

    const dtoSinCamposExtra = Object.fromEntries(
  Object.entries(dto as any).filter(([k]) => k !== 'idempleado')
);
this.offlineQueue.add('tarea', 'CREATE', { 
  ...dtoSinCamposExtra, 
  idtarea: tempId  // ← AGREGAR ESTO
});

    return {
      ...tempEntity,
      _mensaje: 'Guardado localmente. Se subirá a Supabase cuando haya internet.',
    };
  }

  // ── update ────────────────────────────────────────────────────────────────
  async update(id: number, dto: UpdateTareaDto) {

  if (!id || isNaN(id) || id < 0) {
    throw new BadRequestException('No se puede editar una tarea que aún no se ha sincronizado.');
  }
    const online = await this.sync.isOnline();

    if (online) {
      const entity = await this.repo.findOneByOrFail({ idtarea: id });
      Object.assign(entity, {
        ...dto,
        idadmincreador: dto.idadmincreador ? ({ idusuario: dto.idadmincreador } as any) : entity.idadmincreador,
        idcultivo:      dto.idcultivo      ? ({ idcultivo: dto.idcultivo }      as any) : entity.idcultivo,
      });
      const saved = await this.repo.save(entity);
      this.cache.set(`tareas_${id}`, saved);
      const all = (this.cache.get<any[]>('tareas_all') ?? []).map(t => t.idtarea === id ? saved : t);
      this.cache.set('tareas_all', all);
      return saved;
    }

    const cached = this.cache.get<any>(`tareas_${id}`);
    const updated = { ...(cached ?? { idtarea: id }), ...dto, _pendiente: 'UPDATE' };
    this.cache.set(`tareas_${id}`, updated);
    const all = (this.cache.get<any[]>('tareas_all') ?? []).map(t => t.idtarea === id ? updated : t);
    this.cache.set('tareas_all', all);
    this.offlineQueue.add('tarea', 'UPDATE', { idtarea: id, ...dto });
    this.logger.log(`📥 Tarea #${id} actualizada offline`);
    return { ...updated, _mensaje: 'Actualizado localmente. Se subirá a Supabase cuando haya internet.' };
  }

  // ── remove ────────────────────────────────────────────────────────────────
  async remove(id: number) {
  if (!id || isNaN(id)) throw new BadRequestException('ID de tarea inválido');

  // ── Siempre limpia del caché primero ─────────────────────────────────────
  this.cache.delete(`tareas_${id}`);
  const allSinEsta = (this.cache.get<any[]>('tareas_all') ?? [])
    .filter(t => t.idtarea !== id);
  this.cache.set('tareas_all', allSinEsta);

  const online = await this.sync.isOnline();

  if (online) {
    // Si es id negativo (offline temporal) no hacer DELETE en BD
    if (id < 0) return { message: 'Tarea offline eliminada' };

    await this.repo.delete(id);
    return { message: 'Tarea eliminada' };
  }

  // Sin internet: encola solo si es id real (positivo)
  if (id > 0) {
    this.offlineQueue.add('tarea', 'DELETE', { idtarea: id });
    this.logger.log(`📥 Tarea #${id} marcada para eliminar offline`);
  }

  return { message: 'Eliminado localmente. Se borrará de Supabase cuando haya internet.' };
}
  // ── asignar ───────────────────────────────────────────────────────────────
  async asignar(idTarea: number, dto: AsignarTareaDto): Promise<AsignacionTarea | any> {
    const online = await this.sync.isOnline();

    if (online) {
      const tarea = await this.repo.findOne({ where: { idtarea: idTarea } });
      if (!tarea) throw new NotFoundException(`Tarea #${idTarea} no encontrada.`);

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
        .where('tarea.idtarea = :idTarea', { idTarea })
        .andWhere('empleado.idusuario = :idEmp', { idEmp: dto.idempleado })
        .getOne();

      if (asignacion) {
        Object.assign(asignacion, {
          estado:           dto.estado           ?? asignacion.estado,
          pagoacordado:     dto.pagoacordado     ?? asignacion.pagoacordado,
          fechaasignacion:  dto.fechaasignacion  ?? asignacion.fechaasignacion,
          idadminasignador: { idusuario: dto.idadminasignador } as any,
        });
      } else {
        asignacion = this.asignacionRepo.create({
          fechaasignacion:  dto.fechaasignacion ?? new Date().toISOString().split('T')[0],
          estado:           dto.estado          ?? 'Asignado',
          pagoacordado:     dto.pagoacordado    ?? null,
          idtarea:          { idtarea: idTarea }               as any,
          idempleado:       { idusuario: dto.idempleado }      as any,
          idadminasignador: { idusuario: dto.idadminasignador } as any,
        });
      }

      const saved = await this.asignacionRepo.save(asignacion);

      const emailEmpleado = empleado.idusuario2?.email ?? '';
      if (emailEmpleado) {
        const nombreTarea = tarea.tipoactividad?.trim() || `Tarea #${idTarea}`;
        this.logger.log(`📧 Enviando email a ${emailEmpleado} — tarea: "${nombreTarea}"`);
        await this.mailService.notificarTareaAsignada(emailEmpleado, nombreTarea);
      }

      return this.asignacionRepo.findOneOrFail({
        where: { idasigtarea: saved.idasigtarea },
        relations: ['idtarea', 'idempleado', 'idempleado.idusuario2', 'idadminasignador'],
      });
    }

    // ── Modo offline ────────────────────────────────────────────────────────
    let nombreEmpleado = '—';
    const empleadosCache: any[] = this.cache.get<any[]>('empleado_all') ?? [];
    const empCache = empleadosCache.find((e: any) => e.idusuario === dto.idempleado);
    if (empCache?.idusuario2) {
      nombreEmpleado = [empCache.idusuario2.primernombre, empCache.idusuario2.primerapellido].filter(Boolean).join(' ');
    } else if (empCache?.primernombre) {
      nombreEmpleado = [empCache.primernombre, empCache.primerapellido].filter(Boolean).join(' ');
    }

    const tareasAll: any[] = this.cache.get<any[]>('tareas_all') ?? [];
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
        _nombreEmpleado: nombreEmpleado,
        asignacionTareas: [...(t.asignacionTareas ?? []), asigSimulada],
      };
    });
    this.cache.set('tareas_all', tareasActualizadas);

    this.offlineQueue.add('asignacion_tarea', 'CREATE', { idtarea: idTarea, ...dto });
    this.logger.log(`📥 Asignación tarea #${idTarea} encolada offline — empleado: ${nombreEmpleado}`);

    const emailEmpleado = empCache?.idusuario2?.email ?? empCache?.email ?? '';
    if (emailEmpleado) {
      const tareaCache = tareasAll.find((t: any) => String(t.idtarea) === String(idTarea));
      const nombreTarea = tareaCache?.tipoactividad?.trim() || `Tarea #${idTarea}`;
      this.offlineQueue.add('_email_pendiente', 'CREATE', {
        tipo: 'tareaAsignada',
        emailDestino: emailEmpleado,
        nombreTarea,
      });
      this.logger.log(`📧 Email pendiente encolado para ${emailEmpleado} — tarea: "${nombreTarea}"`);
    }

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
  async completar(idAsignacion: number): Promise<AsignacionTarea> {
    const asignacion = await this.asignacionRepo.findOneOrFail({
      where: { idasigtarea: idAsignacion },
      relations: ['idtarea', 'idempleado', 'idempleado.idusuario2', 'idadminasignador', 'idadminasignador.idusuario2'],
    });

    asignacion.estado = 'Completado';
    await this.asignacionRepo.save(asignacion);

    const emailAdmin     = asignacion.idadminasignador?.idusuario2?.email ?? '';
    const nombreEmpleado = asignacion.idempleado?.idusuario2?.primernombre ?? 'Empleado';
    const nombreTarea    = asignacion.idtarea?.tipoactividad?.trim() || `Tarea #${idAsignacion}`;

    if (emailAdmin) {
      await this.mailService.notificarTareaCompletada(emailAdmin, nombreTarea, nombreEmpleado);
    }

    return asignacion;
  }
}