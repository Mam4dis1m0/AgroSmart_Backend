import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DetalleTarea } from '../../Entidades/entities/DetalleTarea';
import { CreateDetalleTareaDto, UpdateDetalleTareaDto } from '../../dto/detalle-tarea.dto';

@Injectable()
export class DetalleTareaService {
  constructor(
    @InjectRepository(DetalleTarea)
    private repo: Repository<DetalleTarea>,
  ) {}

  findAll() {
    return this.repo.find({ relations: ['idtarea', 'idinsumo'] });
  }

  findOne(id: number) {
    return this.repo.findOne({ where: { iddetalletarea: id }, relations: ['idtarea', 'idinsumo'] });
  }

  findByTarea(idtarea: number) {
    return this.repo.find({ where: { idtarea: { idtarea } }, relations: ['idinsumo'] });
  }

  create(dto: CreateDetalleTareaDto) {
    const entity = this.repo.create({
      ...dto,
      idinsumo: dto.idinsumo ? { idinsumo: dto.idinsumo } as any : undefined,
      idtarea:  dto.idtarea  ? { idtarea:  dto.idtarea }  as any : undefined,
    });
    return this.repo.save(entity);
  }

  async update(id: number, dto: UpdateDetalleTareaDto) {
    const entity = await this.repo.findOneByOrFail({ iddetalletarea: id });
    Object.assign(entity, {
      ...dto,
      idinsumo: dto.idinsumo ? { idinsumo: dto.idinsumo } as any : entity.idinsumo,
      idtarea:  dto.idtarea  ? { idtarea:  dto.idtarea }  as any : entity.idtarea,
    });
    return this.repo.save(entity);
  }

  async remove(id: number) {
    await this.repo.delete(id);
    return { message: 'Detalle de tarea eliminado' };
  }
}
