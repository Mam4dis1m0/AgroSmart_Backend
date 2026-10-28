import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlantillaLabor } from '../../Entidades/entities/PlantillaLabor';
import { PlantillaLaborInsumo } from '../../Entidades/entities/PlantillaLaborInsumo';
import { Cultivo } from '../../Entidades/entities/Cultivo';
import { Tarea } from '../../Entidades/entities/Tarea';
import { PlantillasController } from './plantillas.controller';
import { PlantillasService } from './plantillas.service';
import { RecurrenciaService } from './recurrencia.service';
import { TareasModule } from '../tareas/tareas.module';

@Module({
  imports: [TypeOrmModule.forFeature([PlantillaLabor, PlantillaLaborInsumo, Cultivo, Tarea]), TareasModule],
  controllers: [PlantillasController],
  providers: [PlantillasService, RecurrenciaService],
  exports: [PlantillasService, RecurrenciaService],
})
export class PlantillasModule {}
