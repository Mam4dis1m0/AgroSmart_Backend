import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProduccionPalma } from '../../Entidades/entities/ProduccionPalma';
import { CreateProduccionPalmaDto, UpdateProduccionPalmaDto } from '../../dto/produccion-palma.dto';

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

  create(dto: CreateProduccionPalmaDto) {
    const entity = this.repo.create({
      ...dto,
      idlote:  dto.idlote  ? { idlote:  dto.idlote }  as any : undefined,
      idpalma: dto.idpalma ? { idpalma: dto.idpalma } as any : undefined,
    });
    return this.repo.save(entity);
  }

  async update(id: number, dto: UpdateProduccionPalmaDto) {
    const entity = await this.repo.findOneByOrFail({ idproduccionpalma: id });
    Object.assign(entity, {
      ...dto,
      idlote:  dto.idlote  ? { idlote:  dto.idlote }  as any : entity.idlote,
      idpalma: dto.idpalma ? { idpalma: dto.idpalma } as any : entity.idpalma,
    });
    return this.repo.save(entity);
  }

  async remove(id: number) {
    await this.repo.delete(id);
    return { message: 'Registro de producción eliminado' };
  }
}
