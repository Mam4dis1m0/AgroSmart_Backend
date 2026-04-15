import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InsumosService } from './insumos.service';
import { InsumosController } from './insumos.controller';
import { Insumo } from '../Entidades/entities/Insumo';

@Module({
  imports: [TypeOrmModule.forFeature([Insumo])],
  controllers: [InsumosController],
  providers: [InsumosService],
})
export class InsumosModule {}
