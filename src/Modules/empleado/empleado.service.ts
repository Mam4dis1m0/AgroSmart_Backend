import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Empleado } from '../../Entidades/entities/Empleado';

@Injectable()
export class EmpleadoService {
  constructor(
    @InjectRepository(Empleado)
    private repo: Repository<Empleado>,
  ) {}

  findAll() {
  return this.repo
    .createQueryBuilder('empleado')
    .leftJoinAndSelect('empleado.idusuario2', 'usuario')
    .leftJoinAndSelect('empleado.asignacionTareas', 'asig')
    .leftJoinAndSelect('asig.idtarea', 'tarea')
    .getMany();
} 
  findOne(id: number) {
    return this.repo.findOne({ where: { idusuario: id }, relations: ['idusuario2'] });
  }

  create(data: Partial<Empleado>) {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: number, data: Partial<Empleado>) {
    await this.repo.update(id, data);
    return this.repo.findOneBy({ idusuario: id });
  }

  async remove(id: number) {
    await this.repo.delete(id);
    return { message: 'Empleado eliminado' };
  }
}
