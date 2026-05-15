import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsuariosService } from './usuarios.service';
import { UsuariosController } from './usuarios.controller';
import { Usuario } from '../../Entidades/entities/Usuario';
import { Administrador } from '../../Entidades/entities/Administrador';
import { Empleado } from '../../Entidades/entities/Empleado';

@Module({
  imports: [TypeOrmModule.forFeature([Usuario, Administrador, Empleado])],
  controllers: [UsuariosController],
  providers: [UsuariosService],
})
export class UsuariosModule {}