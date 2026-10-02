// src/Modules/notificaciones/notificaciones.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Notificacion } from '../../Entidades/entities/Notificacion';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { BaseOfflineService } from '../../common/base-offline.service';
import { TenantContext } from '../../auth/tenant-context';

/**
 * Una notificación puede ser:
 *   · de la finca (idusuariodestino = null)  → la ven los miembros de esa finca
 *   · para un usuario puntual                → solo esa persona (empleado asignado, comprador cercano)
 * Los compradores no pertenecen a ninguna finca: solo ven las dirigidas a ellos.
 */
@Injectable()
export class NotificacionesService extends BaseOfflineService<Notificacion> {
  // Escoped por finca "a mano": un comprador no tiene finca, así que no usamos where()/withFinca()
  constructor(
    @InjectRepository(Notificacion) repo: Repository<Notificacion>,
    cache: CacheService,
    offlineQueue: OfflineQueueService,
    sync: SyncService,
  ) {
    super(repo, cache, offlineQueue, sync, 'notificacion', 'idnotificacion');
  }

  // Cada usuario tiene su propio caché (las dirigidas a otra persona no deben filtrarse offline)
  protected tenantTag(): string {
    const u = TenantContext.user();
    return `${super.tenantTag()}n${u?.idusuario ?? 0}`;
  }

  /** where de lo que el usuario actual puede ver. */
  private visibles(extra: Record<string, unknown> = {}): any {
    const u = TenantContext.requireUser();
    if (u.rol === 'comprador' || u.idfinca === null) {
      return { ...extra, idusuariodestino: u.idusuario };
    }
    return [
      { ...extra, idfinca: u.idfinca, idusuariodestino: IsNull() },
      { ...extra, idfinca: u.idfinca, idusuariodestino: u.idusuario },
    ];
  }

  findAll() {
    return this.findAllOffline(() =>
      this.repo.find({ where: this.visibles(), order: { fecha: 'DESC' } }),
    );
  }

  findOne(id: number) {
    return this.findOneOffline(id, () =>
      this.repo.findOne({ where: this.visibles({ idnotificacion: id }) }),
    );
  }

  async findNoLeidas() {
    const online = await this.sync.isOnline();
    if (!online) {
      const all = this.cache.get<Notificacion[]>(this.cacheKeyAll()) ?? [];
      return all.filter((n: any) => !n.leida);
    }
    return this.repo.find({ where: this.visibles({ leida: false }), order: { fecha: 'DESC' } });
  }

  /** Alta manual (administrador). Las automáticas las crean los demás servicios/triggers. */
  create(data: Partial<Notificacion>) {
    const { idusuariodestino, ...resto } = data;
    const payload = { ...resto, idusuariodestino: idusuariodestino ?? null };
    return this.createOffline(payload, () =>
      this.repo.save(this.repo.create(this.withFinca(payload))),
    );
  }

  async marcarLeida(id: number) {
    return this.updateOffline(id, { leida: true }, async () => {
      const existente = await this.repo.findOne({ where: this.visibles({ idnotificacion: id }) });
      if (!existente) throw new NotFoundException(`Notificación #${id} no encontrada`);
      await this.repo.update(id, { leida: true });
      return this.repo.findOneBy({ idnotificacion: id });
    });
  }

  async marcarTodasLeidas() {
    const u = TenantContext.requireUser();
    const online = await this.sync.isOnline();

    if (online) {
      const qb = this.repo.createQueryBuilder().update(Notificacion).set({ leida: true }).where('leida = false');
      if (u.rol === 'comprador' || u.idfinca === null) {
        qb.andWhere('idusuariodestino = :u', { u: u.idusuario });
      } else {
        qb.andWhere('idfinca = :f AND (idusuariodestino IS NULL OR idusuariodestino = :u)', {
          f: u.idfinca, u: u.idusuario,
        });
      }
      await qb.execute();
    }

    // Caché: marca todas y, si no hay conexión, encola una actualización por cada pendiente
    const previas = this.cache.get<any[]>(this.cacheKeyAll()) ?? [];
    if (!online) {
      for (const n of previas) {
        if (!n.leida && typeof n.idnotificacion === 'number') {
          this.offlineQueue.add('notificacion', 'UPDATE', {
            idnotificacion: n.idnotificacion,
            leida: true,
            idfinca: n.idfinca ?? u.idfinca,
          });
        }
      }
    }
    this.cache.set(this.cacheKeyAll(), previas.map((n) => ({ ...n, leida: true })));
    return { message: 'Todas las notificaciones marcadas como leídas' };
  }

  remove(id: number) {
    return this.removeOffline(id, () => this.deleteEnFinca(id));
  }
}
