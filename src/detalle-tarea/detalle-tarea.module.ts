import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DetalleTareaService } from './detalle-tarea.service';
import { DetalleTareaController } from './detalle-tarea.controller';
import { DetalleTarea } from '../Entidades/entities/DetalleTarea';

@Module({
  imports: [TypeOrmModule.forFeature([DetalleTarea])],
  controllers: [DetalleTareaController],
  providers: [DetalleTareaService],
})
export class DetalleTareaModule {}