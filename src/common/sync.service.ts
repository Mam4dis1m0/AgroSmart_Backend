// src/common/sync.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OfflineQueueService } from './offline-queue.service';
import { CacheService } from './cache.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);
  private syncing = false;
  private _online = false;
  private _lastCheck = 0;

  // FIX 1: reducido de 30s a 10s para detectar reconexión más rápido
  private readonly CHECK_INTERVAL_MS = 10_000;

  constructor(
    @InjectDataSource() private dataSource: DataSource,
    private queue: OfflineQueueService,
    private cache: CacheService,
    private mailService: MailService,
  ) {}

  async onModuleInit() {
    this._online = await this.checkConnection();
    this._lastCheck = Date.now();

    if (this._online) {
      this.logger.log('✅ Conectado a Supabase — modo online');

      // FIX 2: precarga caché de empleados al arrancar para que
      // el modal de asignar tarea siempre tenga datos disponibles
      try {
        const empleados = await this.dataSource.query(`
          SELECT e.idusuario, e.montoporhora, e.montoporjornal,
                 u.primernombre, u.primerapellido, u.email,
                 json_build_object(
                   'primernombre', u.primernombre,
                   'primerapellido', u.primerapellido,
                   'email', u.email
                 ) AS idusuario2
          FROM empleado e
          JOIN usuario u ON e.idusuario = u.idusuario
        `);
        this.cache.set('empleado_all', empleados);
        this.logger.log(`✅ Caché de empleados precargada (${empleados.length} empleados)`);
      } catch (err) {
        this.logger.warn(`⚠️ No se pudo precargar caché de empleados: ${err.message}`);
      }
    } else {
      this.logger.warn('📴 Sin conexión a Supabase — modo offline activado');
      this.logger.warn('   Los datos se guardarán en caché local (.cache/)');
    }
  }

  // FIX 1: timeout reducido de 8s a 4s para no bloquear requests
  private async checkConnection(): Promise<boolean> {
    try {
      if (!this.dataSource.isInitialized) {
        await this.dataSource.initialize();
      }
      await Promise.race([
        this.dataSource.query('SELECT 1'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 4000),
        ),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  async isOnline(): Promise<boolean> {
    const now = Date.now();
    if (now - this._lastCheck < this.CHECK_INTERVAL_MS) {
      return this._online;
    }
    this._lastCheck = now;
    this.checkConnection().then(online => {
      if (online !== this._online) {
        this._online = online;
        this.logger.log(
          online
            ? '✅ Conexión restaurada — modo online'
            : '📴 Conexión perdida — modo offline',
        );
        // FIX 2: cuando vuelve online, refresca caché de empleados
        if (online) {
          this.dataSource.query(`
            SELECT e.idusuario, e.montoporhora, e.montoporjornal,
                   u.primernombre, u.primerapellido, u.email,
                   json_build_object(
                     'primernombre', u.primernombre,
                     'primerapellido', u.primerapellido,
                     'email', u.email
                   ) AS idusuario2
            FROM empleado e
            JOIN usuario u ON e.idusuario = u.idusuario
          `).then(empleados => {
            this.cache.set('empleado_all', empleados);
            this.logger.log(`✅ Caché de empleados refrescada (${empleados.length} empleados)`);
          }).catch(err => {
            this.logger.warn(`⚠️ No se pudo refrescar caché de empleados: ${err.message}`);
          });
        }
      }
    });
    return this._online;
  }

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

  // ── Orden de prioridad: primero tareas, luego asignaciones, luego emails ──
  const orden = ['tarea', 'asignacion_tarea', '_email_pendiente', '_registro_usuario'];
  const sorted = [
    ...pending.filter(op => op.entity === 'tarea'),
    ...pending.filter(op => op.entity === 'asignacion_tarea'),
    ...pending.filter(op => op.entity === '_email_pendiente'),
    ...pending.filter(op => op.entity === '_registro_usuario'),
    ...pending.filter(op => !orden.includes(op.entity)),
  ];

  for (const op of sorted) {
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
        this.logger.error(`  ❌ [DESCARTADO] ${op.id} — error irrecuperable: ${msg}`);
      } else {
        this.logger.error(`  ❌ ${op.id} falló (se reintentará): ${msg}`);
      }
    }
  }
    // Procesar emails pendientes
    const emailsPendientes = this.queue.getAll().filter(op => op.entity === '_email_pendiente');
    for (const op of emailsPendientes) {
      try {
        if (op.data.tipo === 'tareaAsignada') {
          await this.mailService.notificarTareaAsignada(
            op.data.emailDestino,
            op.data.nombreTarea,
          );
          this.logger.log(`✅ Email pendiente enviado a ${op.data.emailDestino}`);
        }
        this.queue.remove(op.id);
      } catch (err) {
        this.logger.error(`❌ Error enviando email pendiente: ${err.message}`);
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

  private async executeOperation(op: any) {
  const { entity, operation, data } = op;

  // ── Email pendiente ───────────────────────────────────────────────────────
  if (entity === '_email_pendiente') {
    await this.procesarEmailPendiente(data);
    return;
  }

  // ── Registro usuario ──────────────────────────────────────────────────────
  if (entity === '_registro_usuario') {
    await this.syncRegistroUsuario(data);
    return;
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (operation === 'DELETE') {
    const pk = Object.keys(data)[0];
    const pkValue = data[pk];
    if (pkValue === undefined || pkValue === null || isNaN(Number(pkValue))) {
      this.logger.error(`  ❌ DELETE descartado — id inválido: ${pkValue}`);
      return;
    }
    await this.dataSource.query(
      `DELETE FROM "${entity}" WHERE ${pk} = $1`,
      [Number(pkValue)],
    );
    return;
  }

  // ── CREATE especial: tarea (no incluir idtarea negativo) ──────────────────
  if (entity === 'tarea' && operation === 'CREATE') {
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([k, v]) => {
        if (k.startsWith('_')) return false;
        if (k === 'idtarea') return false; // ← excluye el id temporal negativo
        if (typeof v === 'string' && (v as string).startsWith('offline_')) return false;
        return true;
      }),
    );

    const cols = Object.keys(cleanData).join(', ');
    const vals = Object.values(cleanData);
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');

    // Supabase genera el id real automáticamente (SERIAL)
    const result = await this.dataSource.query(
      `INSERT INTO tarea (${cols}) VALUES (${placeholders}) RETURNING idtarea`,
      vals,
    );

    const idReal = result[0]?.idtarea;
    const idTemporal = data.idtarea;
    this.logger.log(`  ✅ Tarea offline sincronizada — id temporal: ${idTemporal} → id real: ${idReal}`);

    // Actualiza asignaciones en cola que apuntaban al id temporal
    if (idReal && idTemporal < 0) {
      const queue = this.queue.getAll();
      let cambios = 0;
      for (const pendiente of queue) {
        if (pendiente.entity === 'asignacion_tarea' && pendiente.data.idtarea === idTemporal) {
          pendiente.data.idtarea = idReal;
          cambios++;
        }
      }
      if (cambios > 0) {
        const fs = require('fs');
        const queueFile = (this.queue as any).queueFile;
        fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));
        this.logger.log(`  🔄 ${cambios} asignación(es) actualizadas: ${idTemporal} → ${idReal}`);
      }
    }
    return;
  }

  // ── CREATE especial: asignacion_tarea — verifica FK antes de insertar ─────
  if (entity === 'asignacion_tarea' && operation === 'CREATE') {
    const idtarea = data.idtarea;

    // Si el idtarea es negativo, la tarea aún no se sincronizó
    if (idtarea < 0) {
      throw new Error(`Tarea padre #${idtarea} aún no sincronizada — reintentando`);
    }

    // Verifica que la tarea exista en Supabase
    const tareaExiste = await this.dataSource.query(
      `SELECT idtarea FROM tarea WHERE idtarea = $1`,
      [idtarea],
    );

    if (!tareaExiste.length) {
      throw new Error(`Tarea #${idtarea} no existe en Supabase todavía`);
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

    await this.dataSource.query(
      `INSERT INTO asignacion_tarea (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
      vals,
    );
    return;
  }

  // ── CREATE / UPDATE genérico ──────────────────────────────────────────────
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
      `INSERT INTO "${entity}" (${cols}) VALUES (${placeholders})`,
      vals,
    );
    return;
  }

  const pk = Object.keys(cleanData)[0];
  const updates = Object.keys(cleanData)
    .map((k, i) => `${k} = $${i + 1}`)
    .join(', ');

  await this.dataSource.query(
    `INSERT INTO "${entity}" (${cols})
     VALUES (${placeholders})
     ON CONFLICT (${pk}) DO UPDATE SET ${updates}`,
    vals,
  );
}

private async procesarEmailPendiente(data: any) {
  if (!data?.tipo || !data?.emailDestino) return;

  if (data.tipo === 'tareaAsignada') {
    await this.mailService.notificarTareaAsignada(
      data.emailDestino,
      data.nombreTarea ?? 'Sin nombre',
    );
    this.logger.log(`  📧 Email tareaAsignada enviado a ${data.emailDestino}`);
  }
}

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