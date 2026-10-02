// src/common/base-offline.service.ts
//
// Clase base que implementa el patrón offline-first (estilo WhatsApp):
//   - Con internet  → opera en Supabase y guarda en caché local
//   - Sin internet  → opera en caché local y encola para sincronizar
//
// Todos los servicios del proyecto extienden esta clase.

import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { ObjectLiteral, Repository } from 'typeorm';
import { TenantContext } from '../auth/tenant-context';
import { CacheService } from './cache.service';
import { OfflineQueueService } from './offline-queue.service';
import { SyncService } from './sync.service';

export abstract class BaseOfflineService<T extends ObjectLiteral> {
  protected readonly logger: Logger;

  /**
   * true  → la tabla tiene columna idfinca (multi-tenant): toda lectura/escritura se
   *         filtra por la finca activa de la sesión.
   * false → tabla global (usuario, administrador, empleado); sobrescribir en la subclase.
   */
  protected readonly escopadoPorFinca: boolean = true;

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

  // ── Multi-tenant ────────────────────────────────────────────────────────

  /** Finca activa de la sesión (lanza 403 si no hay). */
  protected get idfinca(): number {
    return TenantContext.requireFinca();
  }

  /** Fuerza la finca de la sesión: el cliente nunca decide en qué finca escribe (RNF-16). */
  protected withFinca<D extends object>(dto: D): D & { idfinca: number } {
    return { ...dto, idfinca: this.idfinca };
  }

  /** Quita idfinca de lo que mande el cliente (evita mover un registro a otra finca). */
  protected sinFinca<D extends object>(dto: D): Omit<D, 'idfinca'> {
    const { idfinca: _ignorado, ...resto } = dto as any;
    return resto;
  }

  /** where con la finca activa:  this.where({ idlote: id }) */
  protected where(extra: Record<string, unknown> = {}): any {
    return { ...extra, idfinca: this.idfinca };
  }

  /**
   * Verifica que un registro referenciado (lote, cultivo, insumo...) pertenezca a la
   * finca activa. Solo en rutas online; en offline lo respaldan las FK compuestas de la BD.
   */
  protected async assertEnFinca(
    repo: Repository<any>,
    where: Record<string, unknown>,
    etiqueta: string,
  ): Promise<void> {
    const existe = await repo.exist({ where: { ...where, idfinca: this.idfinca } });
    if (!existe) {
      throw new NotFoundException(`${etiqueta} no existe en esta finca`);
    }
  }

  /** UPDATE acotado a la finca activa. Devuelve la fila actualizada o responde 404. */
  protected async updateEnFinca(id: number | string, data: object): Promise<T | null> {
    const where = this.where({ [this.pkField]: id });
    const res = await this.repo.update(where, this.sinFinca(data) as any);
    if (!res.affected) {
      throw new NotFoundException(`${this.entityName} #${id} no existe en esta finca`);
    }
    return this.repo.findOneBy(where);
  }

  /**
   * DELETE acotado a la finca activa. 404 si no existe en esta finca;
   * 409 si tiene dependencias (RNF-06: no se borra lo que otros registros usan).
   */
  protected async deleteEnFinca(id: number | string): Promise<void> {
    try {
      const res = await this.repo.delete(this.where({ [this.pkField]: id }));
      if (!res.affected) {
        throw new NotFoundException(`${this.entityName} #${id} no existe en esta finca`);
      }
    } catch (err: any) {
      if (err?.code === '23503') {
        throw new ConflictException(
          `No se puede eliminar: ${this.entityName} #${id} tiene registros asociados.`,
        );
      }
      throw err;
    }
  }

  // Las claves incluyen la finca: el caché de una finca jamás se sirve a otra.
  //  · empleado → además su id: sus listas vienen filtradas (solo lo suyo) y no deben
  //    mezclarse con las del administrador
  //  · sin finca (comprador, admin que aún no elige) → se aísla por usuario
  protected tenantTag(): string {
    const u = TenantContext.user();
    if (!u) return 'f0';
    if (u.idfinca === null) return `u${u.idusuario}`;
    return u.rol === 'empleado' ? `f${u.idfinca}e${u.idusuario}` : `f${u.idfinca}`;
  }

  protected cacheKeyAll(): string {
    return `${this.entityName}_${this.tenantTag()}_all`;
  }

  protected cacheKeyOne(id: number | string): string {
    return `${this.entityName}_${this.tenantTag()}_${id}`;
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
    const scopedDto = this.escopadoPorFinca ? this.withFinca(dto) : dto;
    const tempId = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const tempItem = {
      [this.pkField]: tempId,
      ...scopedDto,
      _offline: true,
      _pendiente: 'CREATE',
    };

    const all = this.cache.get<any[]>(this.cacheKeyAll()) ?? [];
    this.cache.set(this.cacheKeyAll(), [...all, tempItem]);

    // En la cola NO incluir el pkField temporal — la BD asignará el ID real
    const dtoSinPk = Object.fromEntries(
      Object.entries(scopedDto).filter(([k]) => k !== this.pkField),
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
    const cambios = this.escopadoPorFinca ? this.sinFinca(dto) : dto;
    const cached = this.cache.get<any>(this.cacheKeyOne(id)) ?? { [this.pkField]: id };
    const updated = { ...cached, ...cambios, _pendiente: 'UPDATE' };
    this.updateCacheList(updated);
    // idfinca viaja en la cola: SyncService solo actualiza filas de ESA finca
    this.offlineQueue.add(
      this.entityName,
      'UPDATE',
      this.escopadoPorFinca
        ? { [this.pkField]: id, ...cambios, idfinca: TenantContext.idfinca() }
        : { [this.pkField]: id, ...cambios },
    );
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
    this.offlineQueue.add(
      this.entityName,
      'DELETE',
      this.escopadoPorFinca
        ? { [this.pkField]: id, idfinca: TenantContext.idfinca() }
        : { [this.pkField]: id },
    );
    this.logger.log(`📥 ${this.entityName} #${id} marcado para eliminar offline`);

    return {
      message: 'Eliminado localmente. Se borrará de Supabase cuando haya internet.',
    };
  }
}