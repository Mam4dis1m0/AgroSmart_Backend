// src/Modules/empleado/empleado.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Empleado } from '../../Entidades/entities/Empleado';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { BaseOfflineService } from '../../common/base-offline.service';

@Injectable()
export class EmpleadoService extends BaseOfflineService<Empleado> {
  constructor(
    @InjectRepository(Empleado) repo: Repository<Empleado>,
    cache: CacheService,
    offlineQueue: OfflineQueueService,
    sync: SyncService,
  ) {
    super(repo, cache, offlineQueue, sync, 'empleado', 'idusuario');
  }

  findAll() {
    return this.findAllOffline(() =>
      this.repo.find({
        relations: ['idusuario2'],
      }),
    );
  }

  findOne(id: number) {
    return this.findOneOffline(id, () =>
      this.repo.findOne({ where: { idusuario: id }, relations: ['idusuario2'] }),
    );
  }

  create(data: Partial<Empleado>) {
    return this.createOffline(data, () => this.repo.save(this.repo.create(data)));
  }

  update(id: number, data: Partial<Empleado>) {
    return this.updateOffline(id, data, async () => {
      await this.repo.update(id, data);
      return this.repo.findOne({ where: { idusuario: id }, relations: ['idusuario2'] });
    });
  }

  remove(id: number) {
    return this.removeOffline(id, () => this.repo.delete(id).then(() => {}));
  }
}