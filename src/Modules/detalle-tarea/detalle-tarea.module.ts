// src/Modules/detalle-tarea/detalle-tarea.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DetalleTareaService } from './detalle-tarea.service';
import { DetalleTareaController } from './detalle-tarea.controller';
import { DetalleTarea } from '../../Entidades/entities/DetalleTarea';
import { Insumo } from '../../Entidades/entities/Insumo';
import { MailModule } from '../../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DetalleTarea, Insumo]),
    MailModule,   // para poder inyectar MailService
  ],
  controllers: [DetalleTareaController],
  providers: [DetalleTareaService],
})
export class DetalleTareaModule {}