// src/Modules/usuarios/usuarios.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';
import { Usuario } from '../../Entidades/entities/Usuario';
import { Administrador } from '../../Entidades/entities/Administrador';
import { Empleado } from '../../Entidades/entities/Empleado';
import { CommonModule } from '../../common/common.module';
import { MailModule } from '../../mail/mail.module'; // ← NUEVO

@Module({
  imports: [
    TypeOrmModule.forFeature([Usuario, Administrador, Empleado]),
    CommonModule,
    MailModule, // ← NUEVO
  ],
  controllers: [UsuariosController],
  providers: [UsuariosService],
  exports: [UsuariosService],
})
export class UsuariosModule {}