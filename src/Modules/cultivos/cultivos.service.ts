// src/Modules/cultivos/cultivos.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cultivo } from '../../Entidades/entities/Cultivo';
import { CreateCultivoDto, UpdateCultivoDto } from '../../dto/cultivo.dto';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { BaseOfflineService } from '../../common/base-offline.service';

@Injectable()
export class CultivosService extends BaseOfflineService<Cultivo> {
  constructor(
    @InjectRepository(Cultivo) repo: Repository<Cultivo>,
    cache: CacheService,
    offlineQueue: OfflineQueueService,
    sync: SyncService,
  ) {
    super(repo, cache, offlineQueue, sync, 'cultivo', 'idcultivo');
  }

  findAll() {
    return this.findAllOffline(() =>
      this.repo.createQueryBuilder('cultivo')
        .leftJoinAndSelect('cultivo.idlote', 'lote')
        .leftJoinAndSelect('cultivo.idadminsupervisor', 'admin')
        .getMany(),
    );
  }

  findOne(id: number) {
    return this.findOneOffline(id, () =>
      this.repo.findOne({ where: { idcultivo: id }, relations: ['idlote', 'idadminsupervisor'] }),
    );
  }

  create(dto: CreateCultivoDto) {
    return this.createOffline(dto, () => {
      const entity = this.repo.create({
        ...dto,
        idlote:            dto.idlote            ? { idlote: dto.idlote }               as any : undefined,
        idadminsupervisor: dto.idadminsupervisor ? { idusuario: dto.idadminsupervisor } as any : undefined,
      });
      return this.repo.save(entity);
    });
  }

  update(id: number, dto: UpdateCultivoDto) {
    return this.updateOffline(id, dto, async () => {
      const entity = await this.repo.findOneByOrFail({ idcultivo: id });
      Object.assign(entity, {
        ...dto,
        idlote:            dto.idlote            ? { idlote: dto.idlote }               as any : entity.idlote,
        idadminsupervisor: dto.idadminsupervisor ? { idusuario: dto.idadminsupervisor } as any : entity.idadminsupervisor,
      });
      return this.repo.save(entity);
    });
  }

  remove(id: number) {
    return this.removeOffline(id, () => this.repo.delete(id).then(() => {}));
  }
}
