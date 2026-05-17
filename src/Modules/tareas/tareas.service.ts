import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tarea } from '../../Entidades/entities/Tarea';
import { Empleado } from '../../Entidades/entities/Empleado';
import { AsignacionTarea } from '../../Entidades/entities/AsignacionTarea';
import {
  CreateTareaDto,
  UpdateTareaDto,
  AsignarTareaDto,
} from '../../dto/tarea.dto';
import { MailService } from '../../mail/mail.service'; // ← NUEVO

@Injectable()
export class TareasService {
  constructor(
    @InjectRepository(Tarea)
    private repo: Repository<Tarea>,

    @InjectRepository(Empleado)
    private empleadoRepo: Repository<Empleado>,

    @InjectRepository(AsignacionTarea)
    private asignacionRepo: Repository<AsignacionTarea>,

    private mailService: MailService, // ← NUEVO
  ) {}

  // ── Sin cambios ───────────────────────────────────────────────────────────

  findAll() {
    return this.repo
      .createQueryBuilder('tarea')
      .leftJoinAndSelect('tarea.idadmincreador', 'admin')
      .leftJoinAndSelect('tarea.idcultivo', 'cultivo')
      .leftJoinAndSelect('tarea.asignacionTareas', 'asig')
      .leftJoinAndSelect('asig.idempleado', 'empleado')
      .leftJoinAndSelect('empleado.idusuario2', 'usuario')
      .getMany();
  }

  findOne(id: number) {
    return this.repo.findOne({
      where: { idtarea: id },
      relations: ['idadmincreador', 'idcultivo'],
    });
  }

  findByEstado(estado: string) {
    return this.repo.find({
      where: { estado },
      relations: ['idadmincreador', 'idcultivo'],
    });
  }

  create(dto: CreateTareaDto) {
    const entity = this.repo.create({
      ...dto,
      idadmincreador: dto.idadmincreador
        ? ({ idusuario: dto.idadmincreador } as any)
        : undefined,
      idcultivo: dto.idcultivo
        ? ({ idcultivo: dto.idcultivo } as any)
        : undefined,
    });
    return this.repo.save(entity);
  }

  async update(id: number, dto: UpdateTareaDto) {
    const entity = await this.repo.findOneByOrFail({ idtarea: id });
    Object.assign(entity, {
      ...dto,
      idadmincreador: dto.idadmincreador
        ? ({ idusuario: dto.idadmincreador } as any)
        : entity.idadmincreador,
      idcultivo: dto.idcultivo
        ? ({ idcultivo: dto.idcultivo } as any)
        : entity.idcultivo,
    });
    return this.repo.save(entity);
  }

  async remove(id: number) {
    await this.repo.delete(id);
    return { message: 'Tarea eliminada' };
  }

  // ── asignar() ─────────────────────────────────────────────────────────────

  async asignar(
    idTarea: number,
    dto: AsignarTareaDto,
  ): Promise<AsignacionTarea> {
    const tarea = await this.repo.findOne({ where: { idtarea: idTarea } });
    if (!tarea) throw new NotFoundException(`Tarea #${idTarea} no encontrada.`);

    const empleado = await this.empleadoRepo.findOne({
      where: { idusuario: dto.idempleado },
      relations: ['idusuario2'], // ← para obtener el email del empleado
    });
    if (!empleado) {
      throw new NotFoundException(`Empleado #${dto.idempleado} no encontrado.`);
    }

    let asignacion = await this.asignacionRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.idtarea', 'tarea')
      .leftJoinAndSelect('a.idempleado', 'empleado')
      .leftJoinAndSelect('a.idadminasignador', 'admin')
      .where('tarea.idtarea = :idTarea', { idTarea })
      .andWhere('empleado.idusuario = :idEmp', { idEmp: dto.idempleado })
      .getOne();

    if (asignacion) {
      Object.assign(asignacion, {
        estado: dto.estado ?? asignacion.estado,
        pagoacordado: dto.pagoacordado ?? asignacion.pagoacordado,
        fechaasignacion: dto.fechaasignacion ?? asignacion.fechaasignacion,
        idadminasignador: { idusuario: dto.idadminasignador } as any,
      });
    } else {
      asignacion = this.asignacionRepo.create({
        fechaasignacion:
          dto.fechaasignacion ?? new Date().toISOString().split('T')[0],
        estado: dto.estado ?? 'Asignado',
        pagoacordado: dto.pagoacordado ?? null,
        idtarea: { idtarea: idTarea } as any,
        idempleado: { idusuario: dto.idempleado } as any,
        idadminasignador: { idusuario: dto.idadminasignador } as any,
      });
    }

    const saved = await this.asignacionRepo.save(asignacion);

    // ── NUEVO: enviar email al empleado ───────────────────────────────────
    const emailEmpleado = empleado.idusuario2?.email ?? '';
    if (emailEmpleado) {
      await this.mailService.notificarTareaAsignada(
        emailEmpleado,
        tarea.tipoactividad ?? 'Sin nombre',
      );
    }
    // ─────────────────────────────────────────────────────────────────────

    return this.asignacionRepo.findOneOrFail({
      where: { idasigtarea: saved.idasigtarea },
      relations: [
        'idtarea',
        'idempleado',
        'idempleado.idusuario2',
        'idadminasignador',
      ],
    });
  }

  // ── completar() ───────────────────────────────────────────────────────────

  async completar(idAsignacion: number): Promise<AsignacionTarea> {
    const asignacion = await this.asignacionRepo.findOneOrFail({
      where: { idasigtarea: idAsignacion },
      relations: [
        'idtarea',
        'idempleado',
        'idempleado.idusuario2',
        'idadminasignador',
        'idadminasignador.idusuario2', // ← carga el Usuario del admin
      ],
    });

    asignacion.estado = 'Completado';
    await this.asignacionRepo.save(asignacion);

  const emailAdmin = asignacion.idadminasignador?.idusuario2?.email ?? '';
    const nombreEmpleado =
      asignacion.idempleado?.idusuario2?.primernombre ?? 'Empleado';
    const nombreTarea = asignacion.idtarea?.tipoactividad ?? 'Sin nombre';

    console.log('Email admin:', emailAdmin); // ← para verificar en terminal
    console.log('Nombre empleado:', nombreEmpleado);
    console.log('Nombre tarea:', nombreTarea);

    if (emailAdmin) {
      await this.mailService.notificarTareaCompletada(
        emailAdmin,
        nombreTarea,
        nombreEmpleado,
      );
    }

    return asignacion;
  }
}
