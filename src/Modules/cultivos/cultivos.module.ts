import { Module } from '@nestjs/common';
import { CultivosService } from './cultivos.service';
import { CultivosController } from './cultivos.controller';

@Module({
  controllers: [CultivosController],
  providers: [CultivosService],
})
export class CultivosModule {}
