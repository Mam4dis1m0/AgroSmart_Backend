import { Module } from '@nestjs/common';
import { ProduccionPalmaService } from './produccion-palma.service';
import { ProduccionPalmaController } from './produccion-palma.controller';

@Module({
  controllers: [ProduccionPalmaController],
  providers: [ProduccionPalmaService],
})
export class ProduccionPalmaModule {}
