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

  findAll() {
    return this.repo.find({ order: { fecha: 'DESC' } });
  }

  findOne(id: number) {
    return this.repo.findOneBy({ idauditoria: id });
  }

  findByTabla(tabla: string) {
    return this.repo.find({ where: { tablaNombre: tabla }, order: { fecha: 'DESC' } });
  }

  create(data: Partial<Auditoria>) {
    return this.repo.save(this.repo.create(data));
  }

  // La auditoría generalmente no se actualiza ni elimina,
  // pero se deja por completitud
  async remove(id: number) {
    await this.repo.delete(id);
    return { message: 'Registro de auditoría eliminado' };
  }
}
