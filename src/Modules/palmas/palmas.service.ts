// src/Modules/palmas/palmas.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Palma } from '../../Entidades/entities/Palma';
import { CreatePalmaDto, UpdatePalmaDto } from '../../dto/palma.dto';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { BaseOfflineService } from '../../common/base-offline.service';

@Injectable()
export class PalmasService extends BaseOfflineService<Palma> {
  constructor(
    @InjectRepository(Palma) repo: Repository<Palma>,
    cache: CacheService,
    offlineQueue: OfflineQueueService,
    sync: SyncService,
  ) {
    super(repo, cache, offlineQueue, sync, 'palma', 'idpalma');
  }

  findAll() {
    return this.findAllOffline(() => this.repo.find({ relations: ['idlote'] }));
  }

  findOne(id: number) {
    return this.findOneOffline(id, () =>
      this.repo.findOne({ where: { idpalma: id }, relations: ['idlote'] }),
    );
  }

  async findByLote(idlote: number) {
    const online = await this.sync.isOnline();
    if (!online) {
      const all = this.cache.get<Palma[]>(this.cacheKeyAll()) ?? [];
      return all.filter((p: any) => p.idlote?.idlote === idlote || p.idlote === idlote);
    }
    return this.repo.find({ where: { idlote: { idlote } as any }, relations: ['idlote'] });
  }

  create(dto: CreatePalmaDto) {
    return this.createOffline(dto, () => {
      const entity = this.repo.create({
        ...dto,
        idlote: dto.idlote ? { idlote: dto.idlote } as any : undefined,
      });
      return this.repo.save(entity);
    });
  }

  update(id: number, dto: UpdatePalmaDto) {
    return this.updateOffline(id, dto, async () => {
      const entity = await this.repo.findOneByOrFail({ idpalma: id });
      Object.assign(entity, {
        ...dto,
        idlote: dto.idlote ? { idlote: dto.idlote } as any : entity.idlote,
      });
      return this.repo.save(entity);
    });
  }

  remove(id: number) {
    return this.removeOffline(id, () => this.repo.delete(id).then(() => {}));
  }
}
