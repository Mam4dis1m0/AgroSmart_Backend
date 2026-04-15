import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';

import { UsuariosModule } from './Modules/usuarios/usuarios.module';
import { AdministradorModule } from './Modules/administrador/administrador.module';
import { EmpleadoModule } from './Modules/empleado/empleado.module';
import { LotesModule } from './Modules/lotes/lotes.module';
import { PalmasModule } from './Modules/palmas/palmas.module';
import { CultivosModule } from './Modules/cultivos/cultivos.module';
import { ProduccionPalmaModule } from './Modules/produccion-palma/produccion-palma.module';
import { InsumosModule } from './Modules/insumos/insumos.module';
import { TareasModule } from './Modules/tareas/tareas.module';
import { DetalleTareaModule } from './Modules/detalle-tarea/detalle-tarea.module';
import { AsignacionTareaModule } from './Modules/asignacion-tarea/asignacion-tarea.module';
import { EmpleadoCosechaModule } from './Modules/empleado-cosecha/empleado-cosecha.module';
import { NotificacionesModule } from './Modules/notificaciones/notificaciones.module';
import { AuditoriaModule } from './Modules/auditoria/auditoria.module';

@Module({
  imports: [
    // Carga el .env
    ConfigModule.forRoot({ isGlobal: true }),

    // Conexión a Supabase
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
       entities: [join(__dirname, '**/entities/*.js')],
        synchronize: false,
        ssl: { rejectUnauthorized: false },
      }),
    }),

    UsuariosModule,

    AdministradorModule,

    EmpleadoModule,

    LotesModule,

    PalmasModule,

    CultivosModule,

    ProduccionPalmaModule,

    InsumosModule,

    TareasModule,

    DetalleTareaModule,

    AsignacionTareaModule,

    EmpleadoCosechaModule,

    NotificacionesModule,

    AuditoriaModule,

    
  ],
})
export class AppModule {}