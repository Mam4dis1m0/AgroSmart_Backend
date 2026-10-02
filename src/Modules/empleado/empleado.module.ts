import { Module } from '@nestjs/common';
import { EmpleadoService } from './empleado.service';
import { EmpleadoController } from './empleado.controller';
import { FincasModule } from '../fincas/fincas.module';

@Module({
  imports: [FincasModule],
  controllers: [EmpleadoController],
  providers: [EmpleadoService],
})
export class EmpleadoModule {}
