import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lote } from '../Entidades/entities/Lote';

@Injectable()
export class LotesService {
  constructor(
    @InjectRepository(Lote)
    private repo: Repository<Lote>,
  ) {}

  findAll() {
    return this.repo.find();
  }
  findOne(id: number) {
    return this.repo.findOneBy({ idlote: id });
  }
  create(data: Partial<Lote>) {
    return this.repo.save(this.repo.create(data));
  }
  async update(id: number, data: Partial<Lote>) {
    await this.repo.update(id, data);
    return this.repo.findOneBy({ idlote: id });
  }
  async remove(id: number) {
    await this.repo.delete(id);
    return { message: 'Lote eliminado' };
  }
}
