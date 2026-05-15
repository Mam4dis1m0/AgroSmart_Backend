// src/tareas/tareas.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TareasService }    from './tareas.service';
import { TareasController } from './tareas.controller';
import { Tarea }            from '../../Entidades/entities/Tarea';
import { Empleado }         from '../../Entidades/entities/Empleado';
import { AsignacionTarea }  from '../../Entidades/entities/AsignacionTarea';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tarea,
      Empleado,         // para validar existencia del empleado en asignar()
      AsignacionTarea,  // para crear/actualizar el registro de asignación
    ]),
  ],
  controllers: [TareasController],
  providers: [TareasService],
})
export class TareasModule {}