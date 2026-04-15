import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Palma } from '../Entidades/entities/Palma';

@Injectable()
export class PalmasService {
  constructor(
    @InjectRepository(Palma)
    private repo: Repository<Palma>,
  ) {}

  findAll() {
    return this.repo.find({ relations: ['idlote'] });
  }

  findOne(id: number) {
    return this.repo.findOne({ where: { idpalma: id }, relations: ['idlote'] });
  }

  findByLote(idlote: number) {
    return this.repo.find({ where: { idlote: { idlote } }, relations: ['idlote'] });
  }

  create(data: Partial<Palma>) {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: number, data: Partial<Palma>) {
    await this.repo.update(id, data);
    return this.repo.findOneBy({ idpalma: id });
  }

  async remove(id: number) {
    await this.repo.delete(id);
    return { message: 'Palma eliminada' };
  }
}
