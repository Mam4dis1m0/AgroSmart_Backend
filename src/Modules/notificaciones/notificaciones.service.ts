import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notificacion } from '../../Entidades/entities/Notificacion';

@Injectable()
export class NotificacionesService {
  constructor(
    @InjectRepository(Notificacion)
    private repo: Repository<Notificacion>,
  ) {}

  findAll() {
    return this.repo.find({ order: { fecha: 'DESC' } });
  }

  findOne(id: number) {
    return this.repo.findOneBy({ idnotificacion: id });
  }

  findNoLeidas() {
    return this.repo.find({ where: { leida: false }, order: { fecha: 'DESC' } });
  }

  create(data: Partial<Notificacion>) {
    return this.repo.save(this.repo.create(data));
  }

  async marcarLeida(id: number) {
    await this.repo.update(id, { leida: true });
    return this.repo.findOneBy({ idnotificacion: id });
  }

  async marcarTodasLeidas() {
    await this.repo.update({ leida: false }, { leida: true });
    return { message: 'Todas las notificaciones marcadas como leídas' };
  }

  async remove(id: number) {
    await this.repo.delete(id);
    return { message: 'Notificación eliminada' };
  }
}
