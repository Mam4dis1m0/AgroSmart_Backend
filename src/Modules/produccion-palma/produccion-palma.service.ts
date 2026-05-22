// src/Modules/produccion-palma/produccion-palma.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProduccionPalma } from '../../Entidades/entities/ProduccionPalma';
import { CreateProduccionPalmaDto, UpdateProduccionPalmaDto } from '../../dto/produccion-palma.dto';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { BaseOfflineService } from '../../common/base-offline.service';

@Injectable()
export class ProduccionPalmaService extends BaseOfflineService<ProduccionPalma> {
  constructor(
    @InjectRepository(ProduccionPalma) repo: Repository<ProduccionPalma>,
    cache: CacheService,
    offlineQueue: OfflineQueueService,
    sync: SyncService,
  ) {
    super(repo, cache, offlineQueue, sync, 'produccion_palma', 'idproduccionpalma');
  }

  findAll() {
    return this.findAllOffline(() =>
      this.repo.find({ relations: ['idlote', 'idpalma'] }),
    );
  }

  findOne(id: number) {
    return this.findOneOffline(id, () =>
      this.repo.findOne({ where: { idproduccionpalma: id }, relations: ['idlote', 'idpalma'] }),
    );
  }

  async findByLote(idlote: number) {
    const online = await this.sync.isOnline();
    if (!online) {
      const all = this.cache.get<ProduccionPalma[]>(this.cacheKeyAll()) ?? [];
      return all.filter((p: any) => p.idlote?.idlote === idlote || p.idlote === idlote);
    }
    return this.repo.find({ where: { idlote: { idlote } as any }, relations: ['idpalma'] });
  }

  async findByPalma(idpalma: number) {
    const online = await this.sync.isOnline();
    if (!online) {
      const all = this.cache.get<ProduccionPalma[]>(this.cacheKeyAll()) ?? [];
      return all.filter((p: any) => p.idpalma?.idpalma === idpalma || p.idpalma === idpalma);
    }
    return this.repo.find({ where: { idpalma: { idpalma } as any }, relations: ['idlote'] });
  }

  create(dto: CreateProduccionPalmaDto) {
    return this.createOffline(dto, () => {
      const entity = this.repo.create({
        ...dto,
        idlote:  dto.idlote  ? { idlote:  dto.idlote }  as any : undefined,
        idpalma: dto.idpalma ? { idpalma: dto.idpalma } as any : undefined,
      });
      return this.repo.save(entity);
    });
  }

  update(id: number, dto: UpdateProduccionPalmaDto) {
    return this.updateOffline(id, dto, async () => {
      const entity = await this.repo.findOneByOrFail({ idproduccionpalma: id });
      Object.assign(entity, {
        ...dto,
        idlote:  dto.idlote  ? { idlote:  dto.idlote }  as any : entity.idlote,
        idpalma: dto.idpalma ? { idpalma: dto.idpalma } as any : entity.idpalma,
      });
      return this.repo.save(entity);
    });
  }

  remove(id: number) {
    return this.removeOffline(id, () => this.repo.delete(id).then(() => {}));
  }
}
