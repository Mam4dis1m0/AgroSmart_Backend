// src/common/database.module.ts
import { Global, Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';

import { Usuario }         from '../Entidades/entities/Usuario';
import { Administrador }   from '../Entidades/entities/Administrador';
import { Empleado }        from '../Entidades/entities/Empleado';
import { Lote }            from '../Entidades/entities/Lote';
import { Palma }           from '../Entidades/entities/Palma';
import { Cultivo }         from '../Entidades/entities/Cultivo';
import { ProduccionPalma } from '../Entidades/entities/ProduccionPalma';
import { Insumo }          from '../Entidades/entities/Insumo';
import { Tarea }           from '../Entidades/entities/Tarea';
import { DetalleTarea }    from '../Entidades/entities/DetalleTarea';
import { AsignacionTarea } from '../Entidades/entities/AsignacionTarea';
import { EmpleadoCosecha } from '../Entidades/entities/EmpleadoCosecha';
import { Notificacion }    from '../Entidades/entities/Notificacion';
import { Auditoria }       from '../Entidades/entities/Auditoria';

const logger = new Logger('DatabaseModule');

const ALL_ENTITIES = [
  Usuario, Administrador, Empleado, Lote, Palma, Cultivo,
  ProduccionPalma, Insumo, Tarea, DetalleTarea, AsignacionTarea,
  EmpleadoCosecha, Notificacion, Auditoria,
];

const DataSourceProvider = {
  provide: DataSource,
  inject: [ConfigService],
  useFactory: async (config: ConfigService): Promise<DataSource> => {
    const ds = new DataSource({
      type: 'postgres',
      url: config.get<string>('DATABASE_URL'),
      entities: ALL_ENTITIES,
      synchronize: false,
      ssl: { rejectUnauthorized: false },
      extra: { ssl: { rejectUnauthorized: false } },
      connectTimeoutMS: 5000,
    });

    try {
      await Promise.race([
        ds.initialize(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout 5s')), 5000),
        ),
      ]);
      logger.log('✅ Conectado a Supabase — modo online');
    } catch (err) {
      logger.warn('📴 Sin conexión a Supabase — modo offline activado');
      logger.warn(`   Razón: ${err.message}`);
    }

    return ds;
  },
};

// Proxy offline: en vez de rechazar (que causa unhandledRejection),
// devuelve valores vacíos que BaseOfflineService interpreta como "sin datos"
// y cae automáticamente al caché local.
function offlineRepo(entity: any) {
  const noop = () => Promise.resolve(null);
  const noopArray = () => Promise.resolve([]);
  return {
    target: entity,
    metadata: undefined,
    find: noopArray,
    findOne: noop,
    findOneBy: noop,
    findOneByOrFail: () => Promise.reject(new Error('[OFFLINE] Sin conexión')),
    findOneOrFail: () => Promise.reject(new Error('[OFFLINE] Sin conexión')),
    findBy: noopArray,
    save: noop,
    create: (data: any) => data,
    update: noopArray,
    delete: noopArray,
    remove: noop,
    count: () => Promise.resolve(0),
    query: noopArray,
    createQueryBuilder: () => ({
      leftJoinAndSelect: function() { return this; },
      leftJoin: function() { return this; },
      where: function() { return this; },
      andWhere: function() { return this; },
      orWhere: function() { return this; },
      select: function() { return this; },
      orderBy: function() { return this; },
      getMany: noopArray,
      getOne: noop,
      getRawMany: noopArray,
      getRawOne: noop,
    }),
  };
}

function makeRepoProvider(entity: any) {
  return {
    provide: getRepositoryToken(entity),
    inject: [DataSource],
    useFactory: (ds: DataSource) =>
      ds.isInitialized ? ds.getRepository(entity) : offlineRepo(entity),
  };
}

const REPO_PROVIDERS = ALL_ENTITIES.map(makeRepoProvider);

@Global()
@Module({
  imports: [ConfigModule],
  providers: [DataSourceProvider, ...REPO_PROVIDERS],
  exports: [DataSource, ...REPO_PROVIDERS.map(p => p.provide)],
})
export class DatabaseModule {}