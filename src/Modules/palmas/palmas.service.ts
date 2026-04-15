import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Palma } from '../../Entidades/entities/Palma';
import { CreatePalmaDto, UpdatePalmaDto } from '../../dto/palma.dto';

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

  create(dto: CreatePalmaDto) {
    const entity = this.repo.create({
      ...dto,
      idlote: dto.idlote ? { idlote: dto.idlote } as any : undefined,
    });
    return this.repo.save(entity);
  }

  async update(id: number, dto: UpdatePalmaDto) {
    const entity = await this.repo.findOneByOrFail({ idpalma: id });
    Object.assign(entity, {
      ...dto,
      idlote: dto.idlote ? { idlote: dto.idlote } as any : entity.idlote,
    });
    return this.repo.save(entity);
  }

  async remove(id: number) {
    await this.repo.delete(id);
    return { message: 'Palma eliminada' };
  }
}
