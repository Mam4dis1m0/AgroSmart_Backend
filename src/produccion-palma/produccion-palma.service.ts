import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProduccionPalma } from '../Entidades/entities/ProduccionPalma';

@Injectable()
export class ProduccionPalmaService {
  constructor(
    @InjectRepository(ProduccionPalma)
    private repo: Repository<ProduccionPalma>,
  ) {}

  findAll() {
    return this.repo.find({ relations: ['idlote', 'idpalma'] });
  }

  findOne(id: number) {
    return this.repo.findOne({ where: { idproduccionpalma: id }, relations: ['idlote', 'idpalma'] });
  }

  findByLote(idlote: number) {
    return this.repo.find({ where: { idlote: { idlote } }, relations: ['idpalma'] });
  }

  findByPalma(idpalma: number) {
    return this.repo.find({ where: { idpalma: { idpalma } }, relations: ['idlote'] });
  }

  create(data: Partial<ProduccionPalma>) {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: number, data: Partial<ProduccionPalma>) {
    await this.repo.update(id, data);
    return this.repo.findOneBy({ idproduccionpalma: id });
  }

  async remove(id: number) {
    await this.repo.delete(id);
    return { message: 'Registro de producción eliminado' };
  }
}
