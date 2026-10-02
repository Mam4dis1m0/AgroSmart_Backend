// src/Modules/empleado/empleado.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Empleado } from '../../Entidades/entities/Empleado';
import { FincaUsuario } from '../../Entidades/entities/FincaUsuario';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { BaseOfflineService } from '../../common/base-offline.service';
import { FincasService } from '../fincas/fincas.service';

/** Columnas del usuario que se exponen junto al empleado (nunca la contraseña). */
const COLUMNAS_USUARIO = [
  'u.idusuario', 'u.primernombre', 'u.segundonombre', 'u.primerapellido', 'u.segundoapellido',
  'u.email', 'u.telefono', 'u.cedula', 'u.fotoperfil', 'u.activo',
];

@Injectable()
export class EmpleadoService extends BaseOfflineService<Empleado> {
  // La tarifa del empleado es global; a qué finca pertenece lo dice finca_usuario
  protected readonly escopadoPorFinca = false;

  constructor(
    @InjectRepository(Empleado) repo: Repository<Empleado>,
    cache: CacheService,
    offlineQueue: OfflineQueueService,
    sync: SyncService,
    private readonly fincas: FincasService,
  ) {
    super(repo, cache, offlineQueue, sync, 'empleado', 'idusuario');
  }

  /** Query base: solo empleados ACTIVOS de la finca de la sesión. */
  private deLaFinca() {
    return this.repo
      .createQueryBuilder('e')
      .innerJoin('e.idusuario2', 'u')
      .innerJoin(
        FincaUsuario,
        'fu',
        "fu.idusuario = e.idusuario AND fu.idfinca = :f AND fu.rol = 'empleado' AND fu.activo = true",
        { f: this.idfinca },
      )
      .select(['e', ...COLUMNAS_USUARIO]);
  }

  findAll() {
    return this.findAllOffline(() => this.deLaFinca().getMany());
  }

  findOne(id: number) {
    return this.findOneOffline(id, () => this.deLaFinca().andWhere('e.idusuario = :id', { id }).getOne());
  }

  private validarMontos(data: Partial<Empleado>) {
    for (const [campo, valor] of Object.entries({
      montoporhora: data.montoporhora, montoporjornal: data.montoporjornal,
    })) {
      if (valor !== undefined && valor !== null && !(Number(valor) >= 0)) {
        throw new BadRequestException(`${campo} debe ser mayor o igual a cero`);
      }
    }
  }

  /**
   * Da de alta a un usuario ya registrado como empleado de esta finca (valida el límite del plan).
   * Para crear la cuenta Y el empleado a la vez usa POST /usuarios/empleados.
   */
  create(data: Partial<Empleado>) {
    if (!data.idusuario) throw new BadRequestException('idusuario es obligatorio');
    this.validarMontos(data);
    return this.createOffline(data, async () => {
      await this.fincas.agregarMiembro(this.idfinca, data.idusuario as number, 'empleado');
      const existente = await this.repo.findOneBy({ idusuario: data.idusuario });
      if (existente) {
        await this.repo.update(data.idusuario as number, {
          montoporhora: data.montoporhora ?? existente.montoporhora,
          montoporjornal: data.montoporjornal ?? existente.montoporjornal,
        });
      } else {
        await this.repo.save(this.repo.create(data));
      }
      return this.deLaFinca().andWhere('e.idusuario = :id', { id: data.idusuario }).getOneOrFail();
    });
  }

  update(id: number, data: Partial<Empleado>) {
    this.validarMontos(data);
    const cambios = { montoporhora: data.montoporhora, montoporjornal: data.montoporjornal };
    return this.updateOffline(id, cambios, async () => {
      if (!(await this.fincas.esMiembro(this.idfinca, id, 'empleado'))) {
        throw new NotFoundException(`empleado #${id} no pertenece a esta finca`);
      }
      await this.repo.update(id, cambios);
      return this.deLaFinca().andWhere('e.idusuario = :id', { id }).getOne();
    });
  }

  /** Desvincula al empleado de ESTA finca (conserva su historial de tareas y pagos). */
  remove(id: number) {
    return this.removeOffline(id, () => this.fincas.quitarMiembro(this.idfinca, id));
  }
}
