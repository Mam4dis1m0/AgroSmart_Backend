import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario } from '../../Entidades/entities/Usuario';
import { Administrador } from '../../Entidades/entities/Administrador';
import { Empleado } from '../../Entidades/entities/Empleado';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario)
    private usuarioRepo: Repository<Usuario>,

    @InjectRepository(Administrador)
    private adminRepo: Repository<Administrador>,

    @InjectRepository(Empleado)
    private empleadoRepo: Repository<Empleado>,
  ) {}

  findAll() { return this.usuarioRepo.find(); }
  findOne(id: number) { return this.usuarioRepo.findOneBy({ idusuario: id }); }

  async update(id: number, data: Partial<Usuario>) {
    await this.usuarioRepo.update(id, data);
    return this.usuarioRepo.findOneBy({ idusuario: id });
  }

  async remove(id: number) {
    await this.usuarioRepo.delete(id);
    return { message: 'Usuario eliminado' };
  }

  // ── Registro ──
  async registrar(data: any) {
    const hash = await bcrypt.hash(data.contrasena, 10);

    const usuario = this.usuarioRepo.create({
      primernombre:    data.primernombre,
      segundonombre:   data.segundonombre,
      primerapellido:  data.primerapellido,
      segundoapellido: data.segundoapellido,
      email:           data.email,
      contrasena:      hash,
      telefono:        data.telefono,
    });
    const saved = await this.usuarioRepo.save(usuario);

    if (data.role === 'admin') {
      const admin = this.adminRepo.create({
        idusuario:    saved.idusuario,
        montomensual: data.montomensual ?? 0,
      });
      await this.adminRepo.save(admin);
    } else {
      const empleado = this.empleadoRepo.create({
        idusuario:      saved.idusuario,
        montoporhora:   data.montoporhora ?? 0,
        montoporjornal: data.montoporjornal ?? 0,
      });
      await this.empleadoRepo.save(empleado);
    }

    return { message: 'Usuario registrado', id: saved.idusuario };
  }

  // ── Login ──
  async login(email: string, contrasena: string) {
    const usuario = await this.usuarioRepo.findOneBy({ email });
    if (!usuario) throw new UnauthorizedException('Usuario no encontrado');

    const valida = await bcrypt.compare(contrasena, usuario.contrasena!);
    if (!valida) throw new UnauthorizedException('Contraseña incorrecta');

    const esAdmin = await this.adminRepo.findOneBy({ idusuario: usuario.idusuario });
    const role = esAdmin ? 'admin' : 'empleado';

    return {
      usuario: {
        id:     usuario.idusuario,
        nombre: usuario.primernombre,
        email:  usuario.email,
        role,
      }
    };
  }
}