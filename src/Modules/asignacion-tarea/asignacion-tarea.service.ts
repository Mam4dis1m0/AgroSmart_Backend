// src/Modules/asignacion-tarea/asignacion-tarea.service.ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AsignacionTarea } from '../../Entidades/entities/AsignacionTarea';
import { Tarea } from '../../Entidades/entities/Tarea';
import { CreateAsignacionTareaDto, UpdateAsignacionTareaDto } from '../../dto/asignacion-tarea.dto';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { BaseOfflineService } from '../../common/base-offline.service';
import { TenantContext } from '../../auth/tenant-context';

/** Campos que un EMPLEADO puede modificar en su propia asignación (CU-10, CU-11). */
const CAMPOS_EMPLEADO = ['estado', 'horastrabajadas', 'jornadastrabajadas'] as const;

@Injectable()
export class AsignacionTareaService extends BaseOfflineService<AsignacionTarea> {
  constructor(
    @InjectRepository(AsignacionTarea) repo: Repository<AsignacionTarea>,
    cache: CacheService,
    offlineQueue: OfflineQueueService,
    sync: SyncService,
  ) {
    super(repo, cache, offlineQueue, sync, 'asignacion_tarea', 'idasigtarea');
  }

  /** CU-09: el empleado solo ve lo suyo; el administrador ve toda la finca. */
  private soloMio(): number | null {
    const u = TenantContext.requireUser();
    return u.rol === 'empleado' ? u.idusuario : null;
  }

  private filtroEmpleado(mio: number | null) {
    // Se filtra por el valor de la FK (idempleado = usuario): el formato { idempleado: { idusuario } }
    // falla en estas entidades porque la relación y su columna se llaman igual.
    return mio !== null ? { idempleado: mio } : {};
  }

  findAll() {
    const mio = this.soloMio();
    return this.findAllOffline(() =>
      this.repo.find({
        where: this.where(this.filtroEmpleado(mio)),
        relations: ['idtarea', 'idempleado', 'idadminasignador'],
      }),
    );
  }

  findOne(id: number) {
    const mio = this.soloMio();
    return this.findOneOffline(id, () =>
      this.repo.findOne({
        where: this.where({ idasigtarea: id, ...this.filtroEmpleado(mio) }),
        relations: ['idtarea', 'idempleado', 'idadminasignador'],
      }),
    );
  }

  async findByEmpleado(idempleado: number) {
    const mio = this.soloMio();
    if (mio !== null && mio !== idempleado) {
      throw new ForbiddenException('Solo puedes consultar tus propias tareas');
    }
    const online = await this.sync.isOnline();
    if (!online) {
      const all = this.cache.get<AsignacionTarea[]>(this.cacheKeyAll()) ?? [];
      return all.filter((a: any) => a.idempleado?.idusuario === idempleado || a.idempleado === idempleado);
    }
    return this.repo.find({
      where: this.where({ idempleado }),
      relations: ['idtarea'],
    });
  }

  private async exigirMiembro(idusuario: number, rol: 'admin' | 'empleado', etiqueta: string) {
    const r = await this.repo.manager.query(
      `SELECT 1 FROM finca_usuario WHERE idfinca = $1 AND idusuario = $2 AND rol = $3 AND activo = true`,
      [this.idfinca, idusuario, rol],
    );
    if (!r.length) throw new NotFoundException(`${etiqueta} no pertenece a esta finca`);
  }

  private validarHoras(dto: { horastrabajadas?: number; jornadastrabajadas?: number }) {
    for (const [campo, valor] of Object.entries({
      horastrabajadas: dto.horastrabajadas, jornadastrabajadas: dto.jornadastrabajadas,
    })) {
      if (valor !== undefined && valor !== null && !(Number(valor) >= 0)) {
        throw new BadRequestException(`${campo} debe ser mayor o igual a cero`);
      }
    }
  }

  create(dto: CreateAsignacionTareaDto) {
    this.validarHoras(dto);
    // El asignador es quien tiene la sesión, no lo que diga el cliente
    const data = { ...dto, idadminasignador: TenantContext.requireUser().idusuario };
    return this.createOffline(data, async () => {
      if (data.idtarea) {
        await this.assertEnFinca(this.repo.manager.getRepository(Tarea), { idtarea: data.idtarea }, 'La tarea');
      }
      if (data.idempleado) await this.exigirMiembro(data.idempleado, 'empleado', 'El empleado');
      const entity = this.repo.create({
        ...this.withFinca(data),
        idadminasignador: { idusuario: data.idadminasignador } as any,
        idempleado:       data.idempleado ? { idusuario: data.idempleado } as any : undefined,
        idtarea:          data.idtarea    ? { idtarea:   data.idtarea }    as any : undefined,
      });
      return this.repo.save(entity);
    });
  }

  update(id: number, dto: UpdateAsignacionTareaDto) {
    const yo = TenantContext.requireUser();
    this.validarHoras(dto);

    // Un empleado solo puede tocar estado/horas de SU asignación; nada más.
    let cambios: Record<string, unknown> = { ...dto };
    if (yo.rol === 'empleado') {
      cambios = {};
      for (const campo of CAMPOS_EMPLEADO) {
        if ((dto as any)[campo] !== undefined) cambios[campo] = (dto as any)[campo];
      }
    }
    delete cambios.idadminasignador; // quién asignó no se reescribe

    return this.updateOffline(id, cambios, async () => {
      const entity = await this.repo.findOne({
        where: this.where({ idasigtarea: id }),
        relations: ['idempleado'],
      });
      if (!entity) throw new NotFoundException(`asignacion_tarea #${id} no existe en esta finca`);
      if (yo.rol === 'empleado' && entity.idempleado?.idusuario !== yo.idusuario) {
        throw new ForbiddenException('Esta asignación no es tuya');
      }
      const c: any = cambios;
      if (c.idtarea) {
        await this.assertEnFinca(this.repo.manager.getRepository(Tarea), { idtarea: c.idtarea }, 'La tarea');
      }
      if (c.idempleado) await this.exigirMiembro(c.idempleado, 'empleado', 'El empleado');

      Object.assign(entity, {
        ...this.sinFinca(c),
        idempleado: c.idempleado ? { idusuario: c.idempleado } as any : entity.idempleado,
        idtarea:    c.idtarea    ? { idtarea:   c.idtarea }    as any : entity.idtarea,
      });
      return this.repo.save(entity);
    });
  }

  remove(id: number) {
    return this.removeOffline(id, () => this.deleteEnFinca(id));
  }
}
