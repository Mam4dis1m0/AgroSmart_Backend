import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AsignacionTarea } from '../../Entidades/entities/AsignacionTarea';
import { CreateAsignacionTareaDto, UpdateAsignacionTareaDto } from '../../dto/asignacion-tarea.dto';

@Injectable()
export class AsignacionTareaService {
  constructor(
    @InjectRepository(AsignacionTarea)
    private repo: Repository<AsignacionTarea>,
  ) {}

  findAll() {
    return this.repo.find({ relations: ['idtarea', 'idempleado', 'idadminasignador'] });
  }

  findOne(id: number) {
    return this.repo.findOne({ where: { idasigtarea: id }, relations: ['idtarea', 'idempleado', 'idadminasignador'] });
  }

  findByEmpleado(idempleado: number) {
    return this.repo.find({ where: { idempleado: { idusuario: idempleado } }, relations: ['idtarea'] });
  }

  create(dto: CreateAsignacionTareaDto) {
    const entity = this.repo.create({
      ...dto,
      idadminasignador: dto.idadminasignador ? { idusuario: dto.idadminasignador } as any : undefined,
      idempleado:       dto.idempleado       ? { idusuario: dto.idempleado }       as any : undefined,
      idtarea:          dto.idtarea          ? { idtarea:   dto.idtarea }           as any : undefined,
    });
    return this.repo.save(entity);
  }

  async update(id: number, dto: UpdateAsignacionTareaDto) {
    const entity = await this.repo.findOneByOrFail({ idasigtarea: id });
    Object.assign(entity, {
      ...dto,
      idadminasignador: dto.idadminasignador ? { idusuario: dto.idadminasignador } as any : entity.idadminasignador,
      idempleado:       dto.idempleado       ? { idusuario: dto.idempleado }       as any : entity.idempleado,
      idtarea:          dto.idtarea          ? { idtarea:   dto.idtarea }           as any : entity.idtarea,
    });
    return this.repo.save(entity);
  }

  async remove(id: number) {
    await this.repo.delete(id);
    return { message: 'Asignación eliminada' };
  }
}
