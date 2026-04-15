import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cultivo } from '../../Entidades/entities/Cultivo';
import { CreateCultivoDto, UpdateCultivoDto } from '../../dto/cultivo.dto';

@Injectable()
export class CultivosService {
  constructor(
    @InjectRepository(Cultivo)
    private repo: Repository<Cultivo>,
  ) {}

  findAll() {
    return this.repo.find({ relations: ['idlote', 'idadminsupervisor'] });
  }

  findOne(id: number) {
    return this.repo.findOne({ where: { idcultivo: id }, relations: ['idlote', 'idadminsupervisor'] });
  }

  create(dto: CreateCultivoDto) {
    const entity = this.repo.create({
      ...dto,
      idlote:            dto.idlote            ? { idlote:    dto.idlote }            as any : undefined,
      idadminsupervisor: dto.idadminsupervisor ? { idusuario: dto.idadminsupervisor } as any : undefined,
    });
    return this.repo.save(entity);
  }

  async update(id: number, dto: UpdateCultivoDto) {
    const entity = await this.repo.findOneByOrFail({ idcultivo: id });
    Object.assign(entity, {
      ...dto,
      idlote:            dto.idlote            ? { idlote:    dto.idlote }            as any : entity.idlote,
      idadminsupervisor: dto.idadminsupervisor ? { idusuario: dto.idadminsupervisor } as any : entity.idadminsupervisor,
    });
    return this.repo.save(entity);
  }

  async remove(id: number) {
    await this.repo.delete(id);
    return { message: 'Cultivo eliminado' };
  }
}
