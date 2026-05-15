import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProduccionPalmaService } from './produccion-palma.service';
import { ProduccionPalmaController } from './produccion-palma.controller';
import { ProduccionPalma } from '../../Entidades/entities/ProduccionPalma';

@Module({
  imports: [TypeOrmModule.forFeature([ProduccionPalma])],
  controllers: [ProduccionPalmaController],
  providers: [ProduccionPalmaService],
})
export class ProduccionPalmaModule {}
