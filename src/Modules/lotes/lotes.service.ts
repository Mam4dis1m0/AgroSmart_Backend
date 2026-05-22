// src/Modules/lotes/lotes.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lote } from '../../Entidades/entities/Lote';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { BaseOfflineService } from '../../common/base-offline.service';

@Injectable()
export class LotesService extends BaseOfflineService<Lote> {
  constructor(
    @InjectRepository(Lote) repo: Repository<Lote>,
    cache: CacheService,
    offlineQueue: OfflineQueueService,
    sync: SyncService,
  ) {
    super(repo, cache, offlineQueue, sync, 'lote', 'idlote');
  }

  findAll() {
    return this.findAllOffline(() =>
      this.repo.createQueryBuilder('lote')
        .leftJoinAndSelect('lote.cultivos', 'cultivo')
        .getMany()
    );
  }

  findOne(id: number) {
    return this.findOneOffline(id, () => this.repo.findOneBy({ idlote: id }));
  }

  create(data: Partial<Lote>) {
    return this.createOffline(data, () => this.repo.save(this.repo.create(data)));
  }

  update(id: number, data: Partial<Lote>) {
    return this.updateOffline(id, data, async () => {
      await this.repo.update(id, data);
      return this.repo.findOneBy({ idlote: id });
    });
  }

  remove(id: number) {
    return this.removeOffline(id, () => this.repo.delete(id).then(() => {}));
  }
}