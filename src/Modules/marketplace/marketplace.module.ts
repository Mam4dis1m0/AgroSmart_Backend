import { Module } from '@nestjs/common';
import { SuscripcionesModule } from '../suscripciones/suscripciones.module';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceService } from './marketplace.service';

@Module({
  imports: [SuscripcionesModule], // PasarelaPagoService (listado destacado)
  controllers: [MarketplaceController],
  providers: [MarketplaceService],
})
export class MarketplaceModule {}
