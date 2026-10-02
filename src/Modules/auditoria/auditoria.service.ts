// src/Modules/auditoria/auditoria.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Auditoria } from '../../Entidades/entities/Auditoria';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { BaseOfflineService } from '../../common/base-offline.service';
import { TenantContext } from '../../auth/tenant-context';

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
      this.repo.find({ where: this.where(), order: { fecha: 'DESC' } }),
    );
  }

  findOne(id: number) {
    return this.findOneOffline(id, () => this.repo.findOneBy(this.where({ idauditoria: id })));
  }

  async findByTabla(tabla: string) {
    const online = await this.sync.isOnline();
    if (!online) {
      const all = this.cache.get<Auditoria[]>(this.cacheKeyAll()) ?? [];
      return all.filter((a: any) => a.tablaNombre === tabla);
    }
    return this.repo.find({ where: this.where({ tablaNombre: tabla }), order: { fecha: 'DESC' } });
  }

  /** CU-22 / RNF-07: la acción queda atribuida al usuario de la sesión. */
  create(data: Partial<Auditoria>) {
    const payload = { ...data, idusuario: TenantContext.requireUser().idusuario };
    return this.createOffline(payload, () => this.repo.save(this.repo.create(this.withFinca(payload))));
  }

  remove(id: number) {
    return this.removeOffline(id, () => this.deleteEnFinca(id));
  }
}
