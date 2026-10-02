// src/Modules/produccion-palma/produccion-palma.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProduccionPalma } from '../../Entidades/entities/ProduccionPalma';
import { Lote } from '../../Entidades/entities/Lote';
import { Palma } from '../../Entidades/entities/Palma';
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
      this.repo.find({ where: this.where(), relations: ['idlote', 'idpalma'] }),
    );
  }

  findOne(id: number) {
    return this.findOneOffline(id, () =>
      this.repo.findOne({ where: this.where({ idproduccionpalma: id }), relations: ['idlote', 'idpalma'] }),
    );
  }

  async findByLote(idlote: number) {
    const online = await this.sync.isOnline();
    if (!online) {
      const all = this.cache.get<ProduccionPalma[]>(this.cacheKeyAll()) ?? [];
      return all.filter((p: any) => p.idlote?.idlote === idlote || p.idlote === idlote);
    }
    return this.repo.find({ where: this.where({ idlote }), relations: ['idpalma'] });
  }

  async findByPalma(idpalma: number) {
    const online = await this.sync.isOnline();
    if (!online) {
      const all = this.cache.get<ProduccionPalma[]>(this.cacheKeyAll()) ?? [];
      return all.filter((p: any) => p.idpalma?.idpalma === idpalma || p.idpalma === idpalma);
    }
    return this.repo.find({ where: this.where({ idpalma }), relations: ['idlote'] });
  }

  private async validarReferencias(dto: { idlote?: number; idpalma?: number }) {
    const m = this.repo.manager;
    if (dto.idlote) await this.assertEnFinca(m.getRepository(Lote), { idlote: dto.idlote }, 'El lote');
    if (dto.idpalma) await this.assertEnFinca(m.getRepository(Palma), { idpalma: dto.idpalma }, 'La palma');
  }

  create(dto: CreateProduccionPalmaDto) {
    return this.createOffline(dto, async () => {
      await this.validarReferencias(dto);
      const entity = this.repo.create({
        ...this.withFinca(dto),
        idlote:  dto.idlote  ? { idlote:  dto.idlote }  as any : undefined,
        idpalma: dto.idpalma ? { idpalma: dto.idpalma } as any : undefined,
      });
      return this.repo.save(entity);
    });
  }

  update(id: number, dto: UpdateProduccionPalmaDto) {
    return this.updateOffline(id, dto, async () => {
      const entity = await this.repo.findOneBy(this.where({ idproduccionpalma: id }));
      if (!entity) throw new NotFoundException(`produccion_palma #${id} no existe en esta finca`);
      await this.validarReferencias(dto);
      Object.assign(entity, {
        ...this.sinFinca(dto),
        idlote:  dto.idlote  ? { idlote:  dto.idlote }  as any : entity.idlote,
        idpalma: dto.idpalma ? { idpalma: dto.idpalma } as any : entity.idpalma,
      });
      return this.repo.save(entity);
    });
  }

  remove(id: number) {
    return this.removeOffline(id, () => this.deleteEnFinca(id));
  }
}
