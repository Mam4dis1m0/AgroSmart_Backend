import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TareasService } from './tareas.service';
import { TareasController } from './tareas.controller';
import { Tarea }           from '../../Entidades/entities/Tarea';
import { Empleado }        from '../../Entidades/entities/Empleado';
import { AsignacionTarea } from '../../Entidades/entities/AsignacionTarea';
import { MailModule }      from '../../mail/mail.module';
import { CommonModule }    from '../../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tarea, Empleado, AsignacionTarea]),
    MailModule,
    CommonModule,
  ],
  controllers: [TareasController],
  providers: [TareasService],
})
export class TareasModule {}