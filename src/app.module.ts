// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from './common/database.module';
import { CommonModule }   from './common/common.module';

import { UsuariosModule }        from './Modules/usuarios/usuarios.module';
import { AdministradorModule }   from './Modules/administrador/administrador.module';
import { EmpleadoModule }        from './Modules/empleado/empleado.module';
import { LotesModule }           from './Modules/lotes/lotes.module';
import { PalmasModule }          from './Modules/palmas/palmas.module';
import { CultivosModule }        from './Modules/cultivos/cultivos.module';
import { ProduccionPalmaModule } from './Modules/produccion-palma/produccion-palma.module';
import { InsumosModule }         from './Modules/insumos/insumos.module';
import { TareasModule }          from './Modules/tareas/tareas.module';
import { DetalleTareaModule }    from './Modules/detalle-tarea/detalle-tarea.module';
import { AsignacionTareaModule } from './Modules/asignacion-tarea/asignacion-tarea.module';
import { EmpleadoCosechaModule } from './Modules/empleado-cosecha/empleado-cosecha.module';
import { NotificacionesModule }  from './Modules/notificaciones/notificaciones.module';
import { AuditoriaModule }       from './Modules/auditoria/auditoria.module';
import { ChatModule }            from './Modules/Chat/chat.module';
import { MailModule }            from './mail/mail.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    CommonModule,
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
    ChatModule,
    MailModule,
  ],
})
export class AppModule {}