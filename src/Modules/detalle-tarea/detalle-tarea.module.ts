import { Module } from '@nestjs/common';
import { DetalleTareaService } from './detalle-tarea.service';
import { DetalleTareaController } from './detalle-tarea.controller';

@Module({
  controllers: [DetalleTareaController],
  providers: [DetalleTareaService],
})
export class DetalleTareaModule {}
