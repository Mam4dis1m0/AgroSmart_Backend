// src/Modules/notificaciones/notificaciones.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notificacion } from '../../Entidades/entities/Notificacion';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { BaseOfflineService } from '../../common/base-offline.service';

@Injectable()
export class NotificacionesService extends BaseOfflineService<Notificacion> {
  constructor(
    @InjectRepository(Notificacion) repo: Repository<Notificacion>,
    cache: CacheService,
    offlineQueue: OfflineQueueService,
    sync: SyncService,
  ) {
    super(repo, cache, offlineQueue, sync, 'notificacion', 'idnotificacion');
  }

  findAll() {
    return this.findAllOffline(() =>
      this.repo.find({ order: { fecha: 'DESC' } }),
    );
  }

  findOne(id: number) {
    return this.findOneOffline(id, () => this.repo.findOneBy({ idnotificacion: id }));
  }

  async findNoLeidas() {
    const online = await this.sync.isOnline();
    if (!online) {
      const all = this.cache.get<Notificacion[]>(this.cacheKeyAll()) ?? [];
      return all.filter((n: any) => !n.leida);
    }
    return this.repo.find({ where: { leida: false }, order: { fecha: 'DESC' } });
  }

  create(data: Partial<Notificacion>) {
    return this.createOffline(data, () => this.repo.save(this.repo.create(data)));
  }

  async marcarLeida(id: number) {
    return this.updateOffline(id, { leida: true }, async () => {
      await this.repo.update(id, { leida: true });
      return this.repo.findOneBy({ idnotificacion: id });
    });
  }

  async marcarTodasLeidas() {
    const online = await this.sync.isOnline();
    if (online) {
      await this.repo.update({ leida: false }, { leida: true });
    }
    // Actualizar caché también
    const all = (this.cache.get<any[]>(this.cacheKeyAll()) ?? [])
      .map(n => ({ ...n, leida: true }));
    this.cache.set(this.cacheKeyAll(), all);
    if (!online) {
      this.offlineQueue.add('notificacion', 'UPDATE', { _marcarTodas: true, leida: true });
    }
    return { message: 'Todas las notificaciones marcadas como leídas' };
  }

  remove(id: number) {
    return this.removeOffline(id, () => this.repo.delete(id).then(() => {}));
  }
}
