import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { join } from 'path';
import { UsuariosModule } from './usuarios/usuarios.module';
import { AdministradorModule } from './administrador/administrador.module';
import { EmpleadoModule } from './empleado/empleado.module';
import { LotesModule } from './lotes/lotes.module';
import { PalmasModule } from './palmas/palmas.module';
import { CultivosModule } from './cultivos/cultivos.module';
import { ProduccionPalmaModule } from './produccion-palma/produccion-palma.module';
import { InsumosModule } from './insumos/insumos.module';
import { TareasModule } from './tareas/tareas.module';
import { DetalleTareaModule } from './detalle-tarea/detalle-tarea.module';
import { AsignacionTareaModule } from './asignacion-tarea/asignacion-tarea.module';
import { EmpleadoCosechaModule } from './empleado-cosecha/empleado-cosecha.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { AuditoriaModule } from './auditoria/auditoria.module';

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