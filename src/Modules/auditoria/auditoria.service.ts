// src/Modules/auditoria/auditoria.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Auditoria } from '../../Entidades/entities/Auditoria';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { BaseOfflineService } from '../../common/base-offline.service';

@Injectable()
export class AuditoriaService extends BaseOfflineService<Auditoria> {
  constructor(
    @InjectRepository(Auditoria) repo: Repository<Auditoria>,
    cache: CacheService,
    offlineQueue: OfflineQueueService,
    sync: SyncService,
  ) {
    super(repo, cache, offlineQueue, sync, 'auditoria', 'idauditoria');
  }

  findAll() {
    return this.findAllOffline(() =>
      this.repo.find({ order: { fecha: 'DESC' } }),
    );
  }

  findOne(id: number) {
    return this.findOneOffline(id, () => this.repo.findOneBy({ idauditoria: id }));
  }

  async findByTabla(tabla: string) {
    const online = await this.sync.isOnline();
    if (!online) {
      const all = this.cache.get<Auditoria[]>(this.cacheKeyAll()) ?? [];
      return all.filter((a: any) => a.tablaNombre === tabla);
    }
    return this.repo.find({ where: { tablaNombre: tabla }, order: { fecha: 'DESC' } });
  }

  create(data: Partial<Auditoria>) {
    return this.createOffline(data, () => this.repo.save(this.repo.create(data)));
  }

  remove(id: number) {
    return this.removeOffline(id, () => this.repo.delete(id).then(() => {}));
  }
}
