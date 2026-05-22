// src/Modules/administrador/administrador.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Administrador } from '../../Entidades/entities/Administrador';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { BaseOfflineService } from '../../common/base-offline.service';

@Injectable()
export class AdministradorService extends BaseOfflineService<Administrador> {
  constructor(
    @InjectRepository(Administrador) repo: Repository<Administrador>,
    cache: CacheService,
    offlineQueue: OfflineQueueService,
    sync: SyncService,
  ) {
    super(repo, cache, offlineQueue, sync, 'administrador', 'idusuario');
  }

  findAll() {
    return this.findAllOffline(() => this.repo.find());
  }

  findOne(id: number) {
    return this.findOneOffline(id, () => this.repo.findOneBy({ idusuario: id }));
  }

  create(data: Partial<Administrador>) {
    return this.createOffline(data, () => this.repo.save(this.repo.create(data)));
  }

  update(id: number, data: Partial<Administrador>) {
    return this.updateOffline(id, data, async () => {
      await this.repo.update(id, data);
      return this.repo.findOneBy({ idusuario: id });
    });
  }

  remove(id: number) {
    return this.removeOffline(id, () => this.repo.delete(id).then(() => {}));
  }
}
