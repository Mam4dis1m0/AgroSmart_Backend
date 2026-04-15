import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmpleadoCosecha } from '../Entidades/entities/EmpleadoCosecha';

@Injectable()
export class EmpleadoCosechaService {
  constructor(
    @InjectRepository(EmpleadoCosecha)
    private repo: Repository<EmpleadoCosecha>,
  ) {}

  findAll() { 
    return this.repo.find({
      relations: ['idempleado2', 'idcosecha2'] // Si quieres que traiga los datos del empleado y la cosecha
    }); 
  }

  findOne(id: number) { 
    return this.repo.findOneBy({ idempleadocosecha: id }); 
  }

  create(data: Partial<EmpleadoCosecha>) { 
    return this.repo.save(this.repo.create(data)); 
  }

  async update(id: number, data: Partial<EmpleadoCosecha>) {
    await this.repo.update(id, data);
    return this.repo.findOneBy({ idempleadocosecha: id });
  }

  async remove(id: number) {
    await this.repo.delete(id);
    return { message: 'Registro de cosecha por empleado eliminado' };
  }
}
