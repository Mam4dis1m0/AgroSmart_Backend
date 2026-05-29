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

  // ── NUEVO: caché del estado de conexión ───────────────────────────────────
  // Evita hacer SELECT 1 en CADA request (lo que causaba que las tareas
  // se quedaran "pensando" por varios segundos o timeoutearan en el front).
  // El estado se refresca cada CHECK_INTERVAL_MS milisegundos.
  private _lastCheck = 0;
  private readonly CHECK_INTERVAL_MS = 10_000; // revalida cada 10 segundos

  constructor(
    @InjectDataSource() private dataSource: DataSource,
    private queue: OfflineQueueService,
    private cache: CacheService,
  ) {}

  async onModuleInit() {
    this._online = await this.checkConnection();
    this._lastCheck = Date.now();
    if (this._online) {
      this.logger.log('✅ Conectado a Supabase — modo online');
    } else {
      this.logger.warn('📴 Sin conexión a Supabase — modo offline activado');
      this.logger.warn('   Los datos se guardarán en caché local (.cache/)');
    }
  }

  // ── checkConnection: hace el SELECT 1 real ────────────────────────────────
  private async checkConnection(): Promise<boolean> {
    try {
      if (!this.dataSource.isInitialized) {
        await this.dataSource.initialize();
      }
      // Timeout de 3s para que no bloquee los requests si Supabase tarda
      await Promise.race([
        this.dataSource.query('SELECT 1'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 3000),
        ),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  // ── isOnline: versión con caché — NO bloquea cada request ─────────────────
  async isOnline(): Promise<boolean> {
    const now = Date.now();
    // Si ya chequeamos hace menos de CHECK_INTERVAL_MS, devuelve el valor cacheado
    if (now - this._lastCheck < this.CHECK_INTERVAL_MS) {
      return this._online;
    }
    // Si pasaron más de 10s, revalida en segundo plano sin bloquear
    this._lastCheck = now;
    this.checkConnection().then(online => {
      if (online !== this._online) {
        this._online = online;
        this.logger.log(
          online
            ? '✅ Conexión restaurada — modo online'
            : '📴 Conexión perdida — modo offline',
        );
      }
    });
    return this._online;
  }

  // ── Sincronización automática cada 30 segundos ────────────────────────────
  @Cron(CronExpression.EVERY_30_SECONDS)
  async uploadPending() {
    if (this.syncing) return;

    const pending = this.queue.getAll();
    if (pending.length === 0) return;

    // Para el cron SÍ hacemos check real, no la versión cacheada
    const online = await this.checkConnection();
    this._online = online;
    this._lastCheck = Date.now();

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
        const irrecuperable =
          msg.includes('out of range') ||
          msg.includes('invalid input syntax') ||
          (msg.includes('column') && msg.includes('does not exist')) ||
          msg.includes('violates not-null');

        if (irrecuperable) {
          this.queue.remove(op.id);
          this.logger.error(
            `  ❌ [DESCARTADO] ${op.id} — error irrecuperable: ${msg}`,
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

  // ── executeOperation ──────────────────────────────────────────────────────
  private async executeOperation(op: any) {
    const { entity, operation, data } = op;

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

  // ── syncRegistroUsuario ───────────────────────────────────────────────────
  private async syncRegistroUsuario(data: any) {
    const { userData, role, montoporhora, montoporjornal, montomensual } = data;

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

    const result = await this.dataSource.query(
      `INSERT INTO usuario (${cols})
       VALUES (${placeholders})
       ON CONFLICT (email) DO UPDATE SET ${Object.keys(cleanUser).map((k, i) => `${k} = $${i + 1}`).join(', ')}
       RETURNING idusuario`,
      vals,
    );
    const idusuario = result[0]?.idusuario;
    if (!idusuario) throw new Error('No se pudo obtener el idusuario tras insertar');

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