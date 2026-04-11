import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario } from '../Entidades/Usuario.entidad';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepo: Repository<Usuario>,
  ) {}

  create(dto: CreateUsuarioDto) {
    const usuario = this.usuarioRepo.create(dto);
    return this.usuarioRepo.save(usuario);
  }

  findAll() {
    return this.usuarioRepo.find();
  }

  async findOne(id: number) {
    const usuario = await this.usuarioRepo.findOneBy({ id });
    if (!usuario) throw new NotFoundException(`Usuario #${id} no encontrado`);
    return usuario;
  }

  async update(id: number, dto: UpdateUsuarioDto) {
    await this.findOne(id);
    await this.usuarioRepo.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.usuarioRepo.delete(id);
    return { message: `Usuario #${id} eliminado` };
  }
}