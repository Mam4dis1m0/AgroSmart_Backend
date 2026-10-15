import { Module } from '@nestjs/common';
import { MensajeriaController } from './mensajeria.controller';
import { MensajeriaGateway } from './mensajeria.gateway';
import { MensajeriaService } from './mensajeria.service';

// DataSource, TokenService, SesionService y PlanService son @Global (DatabaseModule / AuthModule).
@Module({
  controllers: [MensajeriaController],
  providers: [MensajeriaService, MensajeriaGateway],
})
export class MensajeriaModule {}
