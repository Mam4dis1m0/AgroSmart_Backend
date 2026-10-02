import { Module } from '@nestjs/common';
import { AdministradorService } from './administrador.service';
import { AdministradorController } from './administrador.controller';
import { FincasModule } from '../fincas/fincas.module';

@Module({
  imports: [FincasModule],
  controllers: [AdministradorController],
  providers: [AdministradorService],
})
export class AdministradorModule {}
