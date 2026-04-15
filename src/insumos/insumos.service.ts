import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Insumo } from '../Entidades/entities/Insumo';

@Injectable()
export class InsumosService {
  constructor(
    @InjectRepository(Insumo)
    private repo: Repository<Insumo>,
  ) {}

  findAll() {
    return this.repo.find();
  }
  findOne(id: number) {
    return this.repo.findOneBy({ idinsumo: id });
  }
  create(data: Partial<Insumo>) {
    return this.repo.save(this.repo.create(data));
  }
  async update(id: number, data: Partial<Insumo>) {
    await this.repo.update(id, data);
    return this.repo.findOneBy({ idinsumo: id });
  }
  async remove(id: number) {
    await this.repo.delete(id);
    return { message: 'Insumo eliminado' };
  }
}
