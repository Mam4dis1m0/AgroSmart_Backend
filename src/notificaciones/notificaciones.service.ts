import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notificacion } from '../Entidades/entities/Notificacion';

@Injectable()
export class NotificacionesService {
  constructor(
    @InjectRepository(Notificacion)
    private repo: Repository<Notificacion>,
  ) {}

  findAll() { 
    return this.repo.find(); 
  }

  findOne(id: number) { 
    return this.repo.findOneBy({ idnotificacion: id }); 
  }

  create(data: Partial<Notificacion>) { 
    return this.repo.save(this.repo.create(data)); 
  }

  async update(id: number, data: Partial<Notificacion>) {
    await this.repo.update(id, data);
    return this.repo.findOneBy({ idnotificacion: id });
  }

  async remove(id: number) {
    await this.repo.delete(id);
    return { message: 'Notificación eliminada' };
  }
}
