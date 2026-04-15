import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AsignacionTareaService } from './asignacion-tarea.service';
import { AsignacionTareaController } from './asignacion-tarea.controller';
import { AsignacionTarea } from '../../Entidades/entities/AsignacionTarea';

@Module({
  imports: [TypeOrmModule.forFeature([AsignacionTarea])],
  controllers: [AsignacionTareaController],
  providers: [AsignacionTareaService],
})
export class AsignacionTareaModule {}
