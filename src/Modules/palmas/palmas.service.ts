// src/Modules/palmas/palmas.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Palma } from '../../Entidades/entities/Palma';
import { Lote } from '../../Entidades/entities/Lote';
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
    return this.findAllOffline(() =>
      this.repo.find({ where: this.where(), relations: ['idlote'] }),
    );
  }

  findOne(id: number) {
    return this.findOneOffline(id, () =>
      this.repo.findOne({ where: this.where({ idpalma: id }), relations: ['idlote'] }),
    );
  }

  async findByLote(idlote: number) {
    const online = await this.sync.isOnline();
    if (!online) {
      const all = this.cache.get<Palma[]>(this.cacheKeyAll()) ?? [];
      return all.filter((p: any) => p.idlote?.idlote === idlote || p.idlote === idlote);
    }
    return this.repo.find({ where: this.where({ idlote }), relations: ['idlote'] });
  }

  create(dto: CreatePalmaDto) {
    return this.createOffline(dto, async () => {
      if (dto.idlote) await this.assertEnFinca(this.repo.manager.getRepository(Lote), { idlote: dto.idlote }, 'El lote');
      const entity = this.repo.create({
        ...this.withFinca(dto),
        idlote: dto.idlote ? { idlote: dto.idlote } as any : undefined,
      });
      return this.repo.save(entity);
    });
  }

  update(id: number, dto: UpdatePalmaDto) {
    return this.updateOffline(id, dto, async () => {
      const entity = await this.repo.findOneBy(this.where({ idpalma: id }));
      if (!entity) throw new NotFoundException(`palma #${id} no existe en esta finca`);
      if (dto.idlote) await this.assertEnFinca(this.repo.manager.getRepository(Lote), { idlote: dto.idlote }, 'El lote');
      Object.assign(entity, {
        ...this.sinFinca(dto),
        idlote: dto.idlote ? { idlote: dto.idlote } as any : entity.idlote,
      });
      return this.repo.save(entity);
    });
  }

  remove(id: number) {
    return this.removeOffline(id, () => this.deleteEnFinca(id));
  }
}
