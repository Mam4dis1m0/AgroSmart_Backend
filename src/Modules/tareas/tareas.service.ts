import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tarea } from '../../Entidades/entities/Tarea';
import { CreateTareaDto, UpdateTareaDto } from '../../dto/tarea.dto';

@Injectable()
export class TareasService {
  constructor(
    @InjectRepository(Tarea)
    private repo: Repository<Tarea>,
  ) {}

  findAll() {
    return this.repo.find({ relations: ['idadmincreador', 'idcultivo'] });
  }

  findOne(id: number) {
    return this.repo.findOne({ where: { idtarea: id }, relations: ['idadmincreador', 'idcultivo'] });
  }

  findByEstado(estado: string) {
    return this.repo.find({ where: { estado }, relations: ['idadmincreador', 'idcultivo'] });
  }

  create(dto: CreateTareaDto) {
    const entity = this.repo.create({
      ...dto,
      idadmincreador: dto.idadmincreador ? { idusuario: dto.idadmincreador } as any : undefined,
      idcultivo:      dto.idcultivo      ? { idcultivo: dto.idcultivo }      as any : undefined,
    });
    return this.repo.save(entity);
  }

  async update(id: number, dto: UpdateTareaDto) {
    const entity = await this.repo.findOneByOrFail({ idtarea: id });
    Object.assign(entity, {
      ...dto,
      idadmincreador: dto.idadmincreador ? { idusuario: dto.idadmincreador } as any : entity.idadmincreador,
      idcultivo:      dto.idcultivo      ? { idcultivo: dto.idcultivo }      as any : entity.idcultivo,
    });
    return this.repo.save(entity);
  }

  async remove(id: number) {
    await this.repo.delete(id);
    return { message: 'Tarea eliminada' };
  }
}
