// src/common/base-offline.service.ts
//
// Clase base que implementa el patrón offline-first (estilo WhatsApp):
//   - Con internet  → opera en Supabase y guarda en caché local
//   - Sin internet  → opera en caché local y encola para sincronizar
//
// Todos los servicios del proyecto extienden esta clase.

import { Logger } from '@nestjs/common';
import { ObjectLiteral, Repository } from 'typeorm';
import { CacheService } from './cache.service';
import { OfflineQueueService } from './offline-queue.service';
import { SyncService } from './sync.service';

export abstract class BaseOfflineService<T extends ObjectLiteral> {
  protected readonly logger: Logger;

  constructor(
    protected readonly repo: Repository<T>,
    protected readonly cache: CacheService,
    protected readonly offlineQueue: OfflineQueueService,
    protected readonly sync: SyncService,
    // Nombre de la entidad para caché y cola  (p.ej. 'lote', 'insumo')
    protected readonly entityName: string,
    // Campo PK de la entidad  (p.ej. 'idlote', 'idinsumo')
    protected readonly pkField: string,
  ) {
    this.logger = new Logger(`${entityName}Service`);
  }

  // ── Helpers de caché ────────────────────────────────────────────────────

  protected cacheKeyAll(): string {
    return `${this.entityName}_all`;
  }

  protected cacheKeyOne(id: number | string): string {
    return `${this.entityName}_${id}`;
  }

  /** Reemplaza o inserta un elemento en la lista cacheada */
  protected updateCacheList(item: any): void {
    const all: any[] = this.cache.get<any[]>(this.cacheKeyAll()) ?? [];
    const idx = all.findIndex(e => e[this.pkField] === item[this.pkField]);
    if (idx >= 0) all[idx] = item;
    else all.push(item);
    this.cache.set(this.cacheKeyAll(), all);
    this.cache.set(this.cacheKeyOne(item[this.pkField]), item);
  }

  /** Elimina un elemento de la lista cacheada */
  protected removeCacheItem(id: number): void {
    const all = (this.cache.get<any[]>(this.cacheKeyAll()) ?? [])
      .filter(e => e[this.pkField] !== id);
    this.cache.set(this.cacheKeyAll(), all);
    this.cache.delete(this.cacheKeyOne(id));
  }

  // ── findAll genérico ────────────────────────────────────────────────────

  async findAllOffline(dbQuery: () => Promise<T[]>): Promise<T[]> {
    const online = await this.sync.isOnline();

    if (!online) {
      this.logger.warn(`📴 offline — ${this.entityName}_all desde caché`);
      return this.cache.get<T[]>(this.cacheKeyAll()) ?? [];
    }

    const rows = await dbQuery();
    this.cache.set(this.cacheKeyAll(), rows);
    return rows;
  }

  // ── findOne genérico ────────────────────────────────────────────────────

  async findOneOffline(id: number, dbQuery: () => Promise<T | null>): Promise<T | null> {
    const online = await this.sync.isOnline();

    if (!online) {
      this.logger.warn(`📴 offline — ${this.entityName}_${id} desde caché`);
      return this.cache.get<T>(this.cacheKeyOne(id)) ?? null;
    }

    const row = await dbQuery();
    if (row) this.cache.set(this.cacheKeyOne(id), row);
    return row;
  }

  // ── create genérico ─────────────────────────────────────────────────────

  async createOffline(dto: any, dbCreate: () => Promise<T>): Promise<T | any> {
    const online = await this.sync.isOnline();

    if (online) {
      const saved = await dbCreate();
      this.updateCacheList(saved);
      return saved;
    }

    // Modo offline: ID temporal con prefijo string para distinguirlo claramente
    // Nunca se envía a la BD — se reemplaza cuando se sincroniza
    const tempId = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const tempItem = {
      [this.pkField]: tempId,
      ...dto,
      _offline: true,
      _pendiente: 'CREATE',
    };

    const all = this.cache.get<any[]>(this.cacheKeyAll()) ?? [];
    this.cache.set(this.cacheKeyAll(), [...all, tempItem]);

    // En la cola NO incluir el pkField temporal — la BD asignará el ID real
    const dtoSinPk = Object.fromEntries(
      Object.entries(dto).filter(([k]) => k !== this.pkField),
    );
    this.offlineQueue.add(this.entityName, 'CREATE', dtoSinPk);
    this.logger.log(`📥 ${this.entityName} creado offline (id temporal: ${tempId})`);

    return {
      ...tempItem,
      _mensaje: 'Guardado localmente. Se subirá a Supabase cuando haya internet.',
    };
  }

  // ── update genérico ─────────────────────────────────────────────────────

  async updateOffline(id: number, dto: any, dbUpdate: () => Promise<T | any>): Promise<T | any> {
    const online = await this.sync.isOnline();

    if (online) {
      const saved = await dbUpdate();
      if (saved) this.updateCacheList(saved);
      return saved;
    }

    // Modo offline: actualiza caché y encola
    const cached = this.cache.get<any>(this.cacheKeyOne(id)) ?? { [this.pkField]: id };
    const updated = { ...cached, ...dto, _pendiente: 'UPDATE' };
    this.updateCacheList(updated);
    this.offlineQueue.add(this.entityName, 'UPDATE', { [this.pkField]: id, ...dto });
    this.logger.log(`📥 ${this.entityName} #${id} actualizado offline`);

    return {
      ...updated,
      _mensaje: 'Actualizado localmente. Se subirá a Supabase cuando haya internet.',
    };
  }

  // ── remove genérico ─────────────────────────────────────────────────────

  async removeOffline(id: number, dbRemove: () => Promise<void>): Promise<any> {
    const online = await this.sync.isOnline();

    if (online) {
      await dbRemove();
      this.removeCacheItem(id);
      return { message: `${this.entityName} eliminado` };
    }

    this.removeCacheItem(id);
    this.offlineQueue.add(this.entityName, 'DELETE', { [this.pkField]: id });
    this.logger.log(`📥 ${this.entityName} #${id} marcado para eliminar offline`);

    return {
      message: 'Eliminado localmente. Se borrará de Supabase cuando haya internet.',
    };
  }
}