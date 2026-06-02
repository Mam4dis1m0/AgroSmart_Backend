// src/Modules/insumos/insumos.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InsumosService } from './insumos.service';
import { InsumosController } from './insumos.controller';
import { Insumo } from '../../Entidades/entities/Insumo';
import { MailModule } from '../../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Insumo]),
    MailModule,
  ],
  controllers: [InsumosController],
  providers: [InsumosService],
})
export class InsumosModule {}