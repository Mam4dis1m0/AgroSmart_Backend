import { Module } from '@nestjs/common';
import { EmpleadoCosechaService } from './empleado-cosecha.service';
import { EmpleadoCosechaController } from './empleado-cosecha.controller';

@Module({
  controllers: [EmpleadoCosechaController],
  providers: [EmpleadoCosechaService],
})
export class EmpleadoCosechaModule {}
