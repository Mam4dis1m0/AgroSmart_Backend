import { Module } from '@nestjs/common';
import { MensajeriaController } from './mensajeria.controller';
import { MensajeriaGateway } from './mensajeria.gateway';
import { MensajeriaService } from './mensajeria.service';
import { SmsWebhookController } from './sms-webhook.controller';
import { SmsService } from './sms.service';

// DataSource, TokenService, SesionService y PlanService son @Global (DatabaseModule / AuthModule).
@Module({
  controllers: [MensajeriaController, SmsWebhookController],
  providers: [MensajeriaService, MensajeriaGateway, SmsService],
})
export class MensajeriaModule {}
