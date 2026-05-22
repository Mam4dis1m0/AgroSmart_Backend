// src/Modules/empleado-cosecha/empleado-cosecha.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmpleadoCosecha } from '../../Entidades/entities/EmpleadoCosecha';
import { CreateEmpleadoCosechaDto, UpdateEmpleadoCosechaDto } from '../../dto/empleado-cosecha.dto';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { BaseOfflineService } from '../../common/base-offline.service';

@Injectable()
export class EmpleadoCosechaService extends BaseOfflineService<EmpleadoCosecha> {
  constructor(
    @InjectRepository(EmpleadoCosecha) repo: Repository<EmpleadoCosecha>,
    cache: CacheService,
    offlineQueue: OfflineQueueService,
    sync: SyncService,
  ) {
    super(repo, cache, offlineQueue, sync, 'empleado_cosecha', 'idempleadocosecha');
  }

  findAll() {
    return this.findAllOffline(() =>
      this.repo.find({ relations: ['idempleado'] }),
    );
  }

  findOne(id: number) {
    return this.findOneOffline(id, () =>
      this.repo.findOne({ where: { idempleadocosecha: id }, relations: ['idempleado'] }),
    );
  }

  async findByEmpleado(idempleado: number) {
    const online = await this.sync.isOnline();
    if (!online) {
      const all = this.cache.get<EmpleadoCosecha[]>(this.cacheKeyAll()) ?? [];
      return all.filter((e: any) => e.idempleado?.idusuario === idempleado || e.idempleado === idempleado);
    }
    return this.repo.find({ where: { idempleado: { idusuario: idempleado } as any }, relations: ['idempleado'] });
  }

  create(dto: CreateEmpleadoCosechaDto) {
    return this.createOffline(dto, () => {
      const entity = this.repo.create({
        ...dto,
        idempleado: dto.idempleado ? { idusuario: dto.idempleado } as any : undefined,
      });
      return this.repo.save(entity);
    });
  }

  update(id: number, dto: UpdateEmpleadoCosechaDto) {
    return this.updateOffline(id, dto, async () => {
      const entity = await this.repo.findOneByOrFail({ idempleadocosecha: id });
      Object.assign(entity, {
        ...dto,
        idempleado: dto.idempleado ? { idusuario: dto.idempleado } as any : entity.idempleado,
      });
      return this.repo.save(entity);
    });
  }

  remove(id: number) {
    return this.removeOffline(id, () => this.repo.delete(id).then(() => {}));
  }
}
