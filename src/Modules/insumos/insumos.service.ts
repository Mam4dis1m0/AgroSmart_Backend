import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Insumo } from '../../Entidades/entities/Insumo';
import { CreateInsumoDto, UpdateInsumoDto } from '../../dto/insumo.dto';

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

  findStockBajo() {
    return this.repo
      .createQueryBuilder('insumo')
      .where('insumo.stockactual < insumo.stockminimo')
      .getMany();
  }

  create(dto: CreateInsumoDto) {
    const entity = this.repo.create({
      ...dto,
      idadminregistro: dto.idadminregistro ? { idusuario: dto.idadminregistro } as any : undefined,
    });
    return this.repo.save(entity);
  }

  async update(id: number, dto: UpdateInsumoDto) {
    const entity = await this.repo.findOneByOrFail({ idinsumo: id });
    Object.assign(entity, {
      ...dto,
      idadminregistro: dto.idadminregistro ? { idusuario: dto.idadminregistro } as any : entity.idadminregistro,
    });
    return this.repo.save(entity);
  }

  async remove(id: number) {
    await this.repo.delete(id);
    return { message: 'Insumo eliminado' };
  }
}
