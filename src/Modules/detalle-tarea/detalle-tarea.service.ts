// src/Modules/detalle-tarea/detalle-tarea.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DetalleTarea } from '../../Entidades/entities/DetalleTarea';
import { CreateDetalleTareaDto, UpdateDetalleTareaDto } from '../../dto/detalle-tarea.dto';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { BaseOfflineService } from '../../common/base-offline.service';

@Injectable()
export class DetalleTareaService extends BaseOfflineService<DetalleTarea> {
  constructor(
    @InjectRepository(DetalleTarea) repo: Repository<DetalleTarea>,
    cache: CacheService,
    offlineQueue: OfflineQueueService,
    sync: SyncService,
  ) {
    super(repo, cache, offlineQueue, sync, 'detalle_tarea', 'iddetalletarea');
  }

  findAll() {
    return this.findAllOffline(() =>
      this.repo.find({ relations: ['idtarea', 'idinsumo'] }),
    );
  }

  findOne(id: number) {
    return this.findOneOffline(id, () =>
      this.repo.findOne({ where: { iddetalletarea: id }, relations: ['idtarea', 'idinsumo'] }),
    );
  }

  async findByTarea(idtarea: number) {
    const online = await this.sync.isOnline();
    if (!online) {
      const all = this.cache.get<DetalleTarea[]>(this.cacheKeyAll()) ?? [];
      return all.filter((d: any) => d.idtarea?.idtarea === idtarea || d.idtarea === idtarea);
    }
    return this.repo.find({ where: { idtarea: { idtarea } as any }, relations: ['idinsumo'] });
  }

  create(dto: CreateDetalleTareaDto) {
    return this.createOffline(dto, () => {
      const entity = this.repo.create({
        ...dto,
        idinsumo: dto.idinsumo ? { idinsumo: dto.idinsumo } as any : undefined,
        idtarea:  dto.idtarea  ? { idtarea:  dto.idtarea }  as any : undefined,
      });
      return this.repo.save(entity);
    });
  }

  update(id: number, dto: UpdateDetalleTareaDto) {
    return this.updateOffline(id, dto, async () => {
      const entity = await this.repo.findOneByOrFail({ iddetalletarea: id });
      Object.assign(entity, {
        ...dto,
        idinsumo: dto.idinsumo ? { idinsumo: dto.idinsumo } as any : entity.idinsumo,
        idtarea:  dto.idtarea  ? { idtarea:  dto.idtarea }  as any : entity.idtarea,
      });
      return this.repo.save(entity);
    });
  }

  remove(id: number) {
    return this.removeOffline(id, () => this.repo.delete(id).then(() => {}));
  }
}
