import { Module } from '@nestjs/common';
import { AsignacionTareaService } from './asignacion-tarea.service';
import { AsignacionTareaController } from './asignacion-tarea.controller';

@Module({
  controllers: [AsignacionTareaController],
  providers: [AsignacionTareaService],
})
export class AsignacionTareaModule {}
