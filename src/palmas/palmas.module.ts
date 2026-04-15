import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PalmasService } from './palmas.service';
import { PalmasController } from './palmas.controller';
import { Palma } from '../Entidades/entities/Palma';

@Module({
  imports: [TypeOrmModule.forFeature([Palma])],
  controllers: [PalmasController],
  providers: [PalmasService],
})
export class PalmasModule {}