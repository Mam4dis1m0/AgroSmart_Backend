// src/Modules/asignacion-tarea/asignacion-tarea.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AsignacionTarea } from '../../Entidades/entities/AsignacionTarea';
import { CreateAsignacionTareaDto, UpdateAsignacionTareaDto } from '../../dto/asignacion-tarea.dto';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { BaseOfflineService } from '../../common/base-offline.service';

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

  findAll() {
    return this.findAllOffline(() =>
      this.repo.find({ relations: ['idtarea', 'idempleado', 'idadminasignador'] }),
    );
  }

  findOne(id: number) {
    return this.findOneOffline(id, () =>
      this.repo.findOne({ where: { idasigtarea: id }, relations: ['idtarea', 'idempleado', 'idadminasignador'] }),
    );
  }

  async findByEmpleado(idempleado: number) {
    const online = await this.sync.isOnline();
    if (!online) {
      const all = this.cache.get<AsignacionTarea[]>(this.cacheKeyAll()) ?? [];
      return all.filter((a: any) => a.idempleado?.idusuario === idempleado || a.idempleado === idempleado);
    }
    return this.repo.find({ where: { idempleado: { idusuario: idempleado } as any }, relations: ['idtarea'] });
  }

  create(dto: CreateAsignacionTareaDto) {
    return this.createOffline(dto, () => {
      const entity = this.repo.create({
        ...dto,
        idadminasignador: dto.idadminasignador ? { idusuario: dto.idadminasignador } as any : undefined,
        idempleado:       dto.idempleado       ? { idusuario: dto.idempleado }       as any : undefined,
        idtarea:          dto.idtarea          ? { idtarea:   dto.idtarea }           as any : undefined,
      });
      return this.repo.save(entity);
    });
  }

  update(id: number, dto: UpdateAsignacionTareaDto) {
    return this.updateOffline(id, dto, async () => {
      const entity = await this.repo.findOneByOrFail({ idasigtarea: id });
      Object.assign(entity, {
        ...dto,
        idadminasignador: dto.idadminasignador ? { idusuario: dto.idadminasignador } as any : entity.idadminasignador,
        idempleado:       dto.idempleado       ? { idusuario: dto.idempleado }       as any : entity.idempleado,
        idtarea:          dto.idtarea          ? { idtarea:   dto.idtarea }           as any : entity.idtarea,
      });
      return this.repo.save(entity);
    });
  }

  remove(id: number) {
    return this.removeOffline(id, () => this.repo.delete(id).then(() => {}));
  }
}
