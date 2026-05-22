// src/common/sync.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OfflineQueueService } from './offline-queue.service';
import { CacheService } from './cache.service';

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);
  private syncing = false;
  private _online = false;

  constructor(
    @InjectDataSource() private dataSource: DataSource,
    private queue: OfflineQueueService,
    private cache: CacheService,
  ) {}

  async onModuleInit() {
    // Al arrancar, intenta conectar sin bloquear
    this._online = await this.checkConnection();
    if (this._online) {
      this.logger.log('✅ Conectado a Supabase — modo online');
    } else {
      this.logger.warn('📴 Sin conexión a Supabase — modo offline activado');
      this.logger.warn('   Los datos se guardarán en caché local (.cache/)');
    }
  }

  // ── Verifica si hay conexión real a la BD ─────────────────────────────────
  private async checkConnection(): Promise<boolean> {
    try {
      // Si TypeORM no logró conectar, dataSource.isInitialized es false
      if (!this.dataSource.isInitialized) {
        await this.dataSource.initialize();
      }
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  // ── Método público que usan los servicios ─────────────────────────────────
  async isOnline(): Promise<boolean> {
    this._online = await this.checkConnection();
    return this._online;
  }

  // ── Sincronización automática cada 30 segundos ────────────────────────────
  @Cron(CronExpression.EVERY_30_SECONDS)
  async uploadPending() {
    if (this.syncing) return;

    const pending = this.queue.getAll();
    if (pending.length === 0) return;

    const online = await this.isOnline();
    if (!online) {
      this.logger.log(`📴 Sin internet — ${pending.length} operaciones en cola esperando`);
      return;
    }

    this.syncing = true;
    this.logger.log(`🔄 Sincronizando ${pending.length} operación(es) pendiente(s)...`);

    for (const op of pending) {
      try {
        await this.executeOperation(op);
        this.queue.remove(op.id);
        this.logger.log(`  ✅ ${op.operation} en ${op.entity} — sincronizado`);
      } catch (err) {
        const msg: string = (err as any)?.message ?? String(err);
        // Errores irrecuperables: dato corrupto que nunca va a funcionar.
        // Se elimina de la cola para no bloquear otras operaciones.
        const irrecuperable =
          msg.includes('out of range') ||
          msg.includes('invalid input syntax') ||
          (msg.includes('column') && msg.includes('does not exist')) ||
          msg.includes('violates not-null');

        if (irrecuperable) {
          this.queue.remove(op.id);
          this.logger.error(
            `  ❌ [DESCARTADO] ${op.id} — error irrecuperable, eliminado de la cola: ${msg}`,
          );
        } else {
          this.logger.error(`  ❌ ${op.id} falló (se reintentará): ${msg}`);
        }
      }
    }

    const restantes = this.queue.count();
    if (restantes === 0) {
      this.logger.log('✅ Cola vacía — todo sincronizado con Supabase');
    } else {
      this.logger.warn(`⚠️  Quedan ${restantes} operaciones sin sincronizar`);
    }

    this.syncing = false;
  }

  // ── Ejecuta una operación de la cola en Supabase ──────────────────────────
  private async executeOperation(op: any) {
    const { entity, operation, data } = op;

    // ── Caso especial: registro de usuario (usuario + empleado/admin) ─────────
    if (entity === '_registro_usuario') {
      await this.syncRegistroUsuario(data);
      return;
    }

    if (operation === 'DELETE') {
      const pk = Object.keys(data)[0];
      await this.dataSource.query(
        `DELETE FROM ${entity} WHERE ${pk} = $1`,
        [data[pk]],
      );
      return;
    }

    // Filtra campos internos y PKs temporales antes de enviar
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([k, v]) => {
        if (k.startsWith('_')) return false;
        if (typeof v === 'string' && (v as string).startsWith('offline_')) return false;
        return true;
      }),
    );

    const cols = Object.keys(cleanData).join(', ');
    const vals = Object.values(cleanData);
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');

    if (operation === 'CREATE') {
      await this.dataSource.query(
        `INSERT INTO ${entity} (${cols}) VALUES (${placeholders})`,
        vals,
      );
      return;
    }

    // UPDATE: ON CONFLICT usando la primera columna como PK
    const pk = Object.keys(cleanData)[0];
    const updates = Object.keys(cleanData)
      .map((k, i) => `${k} = $${i + 1}`)
      .join(', ');

    await this.dataSource.query(
      `INSERT INTO ${entity} (${cols})
       VALUES (${placeholders})
       ON CONFLICT (${pk}) DO UPDATE SET ${updates}`,
      vals,
    );
  }

  // ── Sincroniza un registro de usuario completo (usuario + rol) ────────────
  private async syncRegistroUsuario(data: any) {
    const { userData, role, montoporhora, montoporjornal, montomensual } = data;

    // Limpia campos internos del userData
    const cleanUser = Object.fromEntries(
      Object.entries(userData as Record<string, unknown>).filter(([k, v]) => {
        if (k.startsWith('_')) return false;
        if (typeof v === 'string' && v.startsWith('offline_')) return false;
        return true;
      }),
    );

    const cols = Object.keys(cleanUser).join(', ');
    const vals = Object.values(cleanUser);
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');

    // 1. Inserta en tabla usuario — si ya existe (mismo email) hace UPDATE
    const result = await this.dataSource.query(
      `INSERT INTO usuario (${cols})
       VALUES (${placeholders})
       ON CONFLICT (email) DO UPDATE SET ${Object.keys(cleanUser).map((k, i) => `${k} = $${i + 1}`).join(', ')}
       RETURNING idusuario`,
      vals,
    );
    const idusuario = result[0]?.idusuario;
    if (!idusuario) throw new Error('No se pudo obtener el idusuario tras insertar');

    // 2. Inserta en tabla de rol correspondiente
    if (role === 'admin') {
      await this.dataSource.query(
        `INSERT INTO administrador (idusuario, montomensual)
         VALUES ($1, $2)
         ON CONFLICT (idusuario) DO UPDATE SET montomensual = $2`,
        [idusuario, montomensual ?? 0],
      );
    } else {
      await this.dataSource.query(
        `INSERT INTO empleado (idusuario, montoporhora, montoporjornal)
         VALUES ($1, $2, $3)
         ON CONFLICT (idusuario) DO UPDATE SET montoporhora = $2, montoporjornal = $3`,
        [idusuario, montoporhora ?? 0, montoporjornal ?? 0],
      );
    }

    this.logger.log(`  👤 Usuario sincronizado: idusuario=${idusuario} rol=${role}`);
  }
}