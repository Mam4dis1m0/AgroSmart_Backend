import { Module } from '@nestjs/common';
import { FincasController } from './fincas.controller';
import { FincasService } from './fincas.service';

// Los repositorios (Finca, FincaUsuario...) los provee el DatabaseModule global,
// con el proxy "offline" que ya usan los demás módulos.
@Module({
  controllers: [FincasController],
  providers: [FincasService],
  exports: [FincasService],
})
export class FincasModule {}
