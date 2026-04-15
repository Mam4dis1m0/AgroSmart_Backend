import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AsignacionTarea } from '../Entidades/entities/AsignacionTarea';

@Injectable()
export class AsignacionTareaService {
  constructor(
    @InjectRepository(AsignacionTarea)
    private repo: Repository<AsignacionTarea>,
  ) {}

  findAll() {
    return this.repo.find({ relations: ['idtarea', 'idempleado', 'idadminasignador'] });
  }

  findOne(id: number) {
    return this.repo.findOne({ where: { idasigtarea: id }, relations: ['idtarea', 'idempleado', 'idadminasignador'] });
  }

  findByEmpleado(idempleado: number) {
    return this.repo.find({ where: { idempleado: { idusuario: idempleado } }, relations: ['idtarea'] });
  }

  create(data: Partial<AsignacionTarea>) {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: number, data: Partial<AsignacionTarea>) {
    await this.repo.update(id, data);
    return this.repo.findOneBy({ idasigtarea: id });
  }

  async remove(id: number) {
    await this.repo.delete(id);
    return { message: 'Asignación eliminada' };
  }
}
