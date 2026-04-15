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
    return this.repo.find();
  }
  findOne(id: number) {
    return this.repo.findOneBy({ idproduccionpalma: id });
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
    return { message: 'Produccion eliminada' };
  }
}
