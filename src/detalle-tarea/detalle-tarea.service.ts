import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DetalleTarea } from '../Entidades/entities/DetalleTarea';

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

  create(data: Partial<DetalleTarea>) {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: number, data: Partial<DetalleTarea>) {
    await this.repo.update(id, data);
    return this.repo.findOneBy({ iddetalletarea: id });
  }

  async remove(id: number) {
    await this.repo.delete(id);
    return { message: 'Detalle de tarea eliminado' };
  }
}
