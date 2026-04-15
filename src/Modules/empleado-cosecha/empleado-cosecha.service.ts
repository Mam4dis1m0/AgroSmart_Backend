import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmpleadoCosecha } from '../../Entidades/entities/EmpleadoCosecha';
import { CreateEmpleadoCosechaDto, UpdateEmpleadoCosechaDto } from '../../dto/empleado-cosecha.dto';

@Injectable()
export class EmpleadoCosechaService {
  constructor(
    @InjectRepository(EmpleadoCosecha)
    private repo: Repository<EmpleadoCosecha>,
  ) {}

  findAll() {
    return this.repo.find({ relations: ['idempleado'] });
  }

  findOne(id: number) {
    return this.repo.findOne({ where: { idempleadocosecha: id }, relations: ['idempleado'] });
  }

  findByEmpleado(idempleado: number) {
    return this.repo.find({ where: { idempleado: { idusuario: idempleado } }, relations: ['idempleado'] });
  }

  create(dto: CreateEmpleadoCosechaDto) {
    const entity = this.repo.create({
      ...dto,
      idempleado: dto.idempleado ? { idusuario: dto.idempleado } as any : undefined,
    });
    return this.repo.save(entity);
  }

  async update(id: number, dto: UpdateEmpleadoCosechaDto) {
    const entity = await this.repo.findOneByOrFail({ idempleadocosecha: id });
    Object.assign(entity, {
      ...dto,
      idempleado: dto.idempleado ? { idusuario: dto.idempleado } as any : entity.idempleado,
    });
    return this.repo.save(entity);
  }

  async remove(id: number) {
    await this.repo.delete(id);
    return { message: 'Registro de cosecha eliminado' };
  }
}
