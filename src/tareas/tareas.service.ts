import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tarea } from '../Entidades/entities/Tarea';

@Injectable()
export class TareasService {
  constructor(
    @InjectRepository(Tarea)
    private repo: Repository<Tarea>,
  ) {}

  findAll() {
    return this.repo.find();
  }
  findOne(id: number) {
    return this.repo.findOneBy({ idtarea: id });
  }
  create(data: Partial<Tarea>) {
    return this.repo.save(this.repo.create(data));
  }
  async update(id: number, data: Partial<Tarea>) {
    await this.repo.update(id, data);
    return this.repo.findOneBy({ idtarea: id });
  }
  async remove(id: number) {
    await this.repo.delete(id);
    return { message: 'Tarea eliminada' };
  }
}
