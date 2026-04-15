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
    return this.repo.find({ relations: ['idadminregistro'] });
  }

  findOne(id: number) {
    return this.repo.findOne({ where: { idinsumo: id }, relations: ['idadminregistro'] });
  }

  // Insumos con stock bajo el mínimo
  findStockBajo() {
    return this.repo
      .createQueryBuilder('insumo')
      .where('insumo.stockactual < insumo.stockminimo')
      .getMany();
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
