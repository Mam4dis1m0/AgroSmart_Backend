import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Administrador } from '../../Entidades/entities/Administrador';

@Injectable()
export class AdministradorService {
  constructor(
    @InjectRepository(Administrador)
    private repo: Repository<Administrador>,
  ) {}

  findAll() {
    return this.repo.find();
  }
  findOne(id: number) {
    return this.repo.findOneBy({ idusuario: id });
  }
  create(data: Partial<Administrador>) {
    return this.repo.save(this.repo.create(data));
  }
  async update(id: number, data: Partial<Administrador>) {
    await this.repo.update(id, data);
    return this.repo.findOneBy({ idusuario: id });
  }
  async remove(id: number) {
    await this.repo.delete(id);
    return { message: 'Administrador eliminado' };
  }
}
