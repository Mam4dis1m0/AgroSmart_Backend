import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario } from '../../Entidades/entities/Usuario';

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario)
    private usuarioRepo: Repository<Usuario>,
  ) {}

  findAll() {
    return this.usuarioRepo.find();
  }

  findOne(id: number) {
    return this.usuarioRepo.findOneBy({ idusuario: id });
  }

  create(data: Partial<Usuario>) {
    const usuario = this.usuarioRepo.create(data);
    return this.usuarioRepo.save(usuario);
  }

  async update(id: number, data: Partial<Usuario>) {
    await this.usuarioRepo.update(id, data);
    return this.usuarioRepo.findOneBy({ idusuario: id });
  }

  async remove(id: number) {
    await this.usuarioRepo.delete(id);
    return { message: 'Usuario eliminado' };
  }
}
