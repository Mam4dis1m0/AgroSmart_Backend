import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmpleadoCosechaService } from './empleado-cosecha.service';
import { EmpleadoCosechaController } from './empleado-cosecha.controller';
import { EmpleadoCosecha } from '../Entidades/entities/EmpleadoCosecha'; // Revisa que este sea el nombre exacto

@Module({
  imports: [TypeOrmModule.forFeature([EmpleadoCosecha])],
  controllers: [EmpleadoCosechaController],
  providers: [EmpleadoCosechaService],
})
export class EmpleadoCosechaModule {}
