// src/Modules/insumos/insumos.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Insumo } from '../../Entidades/entities/Insumo';
import { CreateInsumoDto, UpdateInsumoDto } from '../../dto/insumo.dto';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { BaseOfflineService } from '../../common/base-offline.service';

@Injectable()
export class InsumosService extends BaseOfflineService<Insumo> {
  constructor(
    @InjectRepository(Insumo) repo: Repository<Insumo>,
    cache: CacheService,
    offlineQueue: OfflineQueueService,
    sync: SyncService,
  ) {
    super(repo, cache, offlineQueue, sync, 'insumo', 'idinsumo');
  }

  findAll() {
    return this.findAllOffline(() =>
      this.repo.find({ relations: ['idadminregistro'] }),
    );
  }

  findOne(id: number) {
    return this.findOneOffline(id, () =>
      this.repo.findOne({ where: { idinsumo: id }, relations: ['idadminregistro'] }),
    );
  }

  async findStockBajo() {
    const online = await this.sync.isOnline();
    if (!online) {
      const all = this.cache.get<Insumo[]>(this.cacheKeyAll()) ?? [];
      return all.filter((i: any) => i.stockactual < i.stockminimo);
    }
    return this.repo.createQueryBuilder('insumo')
      .where('insumo.stockactual < insumo.stockminimo')
      .getMany();
  }

  create(dto: CreateInsumoDto) {
    return this.createOffline(dto, () => {
      const entity = this.repo.create({
        ...dto,
        idadminregistro: dto.idadminregistro ? { idusuario: dto.idadminregistro } as any : undefined,
      });
      return this.repo.save(entity);
    });
  }

  update(id: number, dto: UpdateInsumoDto) {
    return this.updateOffline(id, dto, async () => {
      const entity = await this.repo.findOneByOrFail({ idinsumo: id });
      Object.assign(entity, {
        ...dto,
        idadminregistro: dto.idadminregistro ? { idusuario: dto.idadminregistro } as any : entity.idadminregistro,
      });
      return this.repo.save(entity);
    });
  }

  remove(id: number) {
    return this.removeOffline(id, () => this.repo.delete(id).then(() => {}));
  }
}
