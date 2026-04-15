import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cultivo } from '../Entidades/entities/Cultivo';

@Injectable()
export class CultivosService {
  constructor(
    @InjectRepository(Cultivo)
    private repo: Repository<Cultivo>,
  ) {}

  findAll() {
    return this.repo.find({ relations: ['idlote', 'idadminsupervisor'] });
  }

  findOne(id: number) {
    return this.repo.findOne({ where: { idcultivo: id }, relations: ['idlote', 'idadminsupervisor'] });
  }

  create(data: Partial<Cultivo>) {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: number, data: Partial<Cultivo>) {
    await this.repo.update(id, data);
    return this.repo.findOneBy({ idcultivo: id });
  }

  async remove(id: number) {
    await this.repo.delete(id);
    return { message: 'Cultivo eliminado' };
  }
}
