import { Module } from '@nestjs/common';
import { PasarelaPagoService } from './pasarela-pago.service';
import { SuscripcionesController } from './suscripciones.controller';
import { SuscripcionesService } from './suscripciones.service';

@Module({
  controllers: [SuscripcionesController],
  providers: [SuscripcionesService, PasarelaPagoService],
  exports: [PasarelaPagoService],
})
export class SuscripcionesModule {}
