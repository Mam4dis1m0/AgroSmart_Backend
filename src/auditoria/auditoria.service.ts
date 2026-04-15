import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Auditoria } from '../Entidades/entities/Auditoria';

@Injectable()
export class AuditoriaService {
  constructor(
    @InjectRepository(Auditoria)
    private repo: Repository<Auditoria>,
  ) {}

  // En auditoría suele servir ver lo último que pasó primero
  findAll() { 
    return this.repo.find({
      order: { idauditoria: 'DESC' } 
    }); 
  }

  findOne(id: number) { 
    return this.repo.findOneBy({ idauditoria: id }); 
  }

  create(data: Partial<Auditoria>) { 
    return this.repo.save(this.repo.create(data)); 
  }

  async update(id: number, data: Partial<Auditoria>) {
    await this.repo.update(id, data);
    return this.repo.findOneBy({ idauditoria: id });
  }

  async remove(id: number) {
    await this.repo.delete(id);
    return { message: 'Registro de auditoría eliminado' };
  }
}
