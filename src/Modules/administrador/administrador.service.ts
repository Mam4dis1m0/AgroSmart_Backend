// src/Modules/administrador/administrador.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Administrador } from '../../Entidades/entities/Administrador';
import { FincaUsuario } from '../../Entidades/entities/FincaUsuario';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { BaseOfflineService } from '../../common/base-offline.service';
import { FincasService } from '../fincas/fincas.service';

@Injectable()
export class AdministradorService extends BaseOfflineService<Administrador> {
  // El perfil de administrador es global; qué finca administra lo dice finca_usuario
  protected readonly escopadoPorFinca = false;

  constructor(
    @InjectRepository(Administrador) repo: Repository<Administrador>,
    cache: CacheService,
    offlineQueue: OfflineQueueService,
    sync: SyncService,
    private readonly fincas: FincasService,
  ) {
    super(repo, cache, offlineQueue, sync, 'administrador', 'idusuario');
  }

  /** Query base: solo administradores ACTIVOS de la finca de la sesión. */
  private deLaFinca() {
    return this.repo
      .createQueryBuilder('a')
      .innerJoin(
        FincaUsuario,
        'fu',
        "fu.idusuario = a.idusuario AND fu.idfinca = :f AND fu.rol = 'admin' AND fu.activo = true",
        { f: this.idfinca },
      );
  }

  findAll() {
    return this.findAllOffline(() => this.deLaFinca().getMany());
  }

  findOne(id: number) {
    return this.findOneOffline(id, () => this.deLaFinca().andWhere('a.idusuario = :id', { id }).getOne());
  }

  /**
   * Convierte a un usuario existente en administrador de esta finca. Solo se admite a
   * usuarios sin finca o que ya pertenecen a esta (no se "roban" usuarios de otras fincas).
   */
  async create(data: Partial<Administrador>) {
    if (!data.idusuario) throw new BadRequestException('idusuario es obligatorio');
    if (data.montomensual !== undefined && data.montomensual !== null && !(Number(data.montomensual) >= 0)) {
      throw new BadRequestException('montomensual debe ser mayor o igual a cero');
    }
    return this.createOffline(data, async () => {
      await this.fincas.agregarMiembro(this.idfinca, data.idusuario as number, 'admin');
      const existente = await this.repo.findOneBy({ idusuario: data.idusuario });
      if (existente) {
        await this.repo.update(data.idusuario as number, { montomensual: data.montomensual ?? existente.montomensual });
        return this.repo.findOneByOrFail({ idusuario: data.idusuario });
      }
      return this.repo.save(this.repo.create(data));
    });
  }

  update(id: number, data: Partial<Administrador>) {
    if (data.montomensual !== undefined && data.montomensual !== null && !(Number(data.montomensual) >= 0)) {
      throw new BadRequestException('montomensual debe ser mayor o igual a cero');
    }
    return this.updateOffline(id, { montomensual: data.montomensual }, async () => {
      if (!(await this.fincas.esMiembro(this.idfinca, id, 'admin'))) {
        throw new NotFoundException(`administrador #${id} no pertenece a esta finca`);
      }
      await this.repo.update(id, { montomensual: data.montomensual });
      return this.repo.findOneBy({ idusuario: id });
    });
  }

  /** Quita al administrador de ESTA finca (no borra su perfil: puede administrar otras). */
  remove(id: number) {
    return this.removeOffline(id, () => this.fincas.quitarMiembro(this.idfinca, id));
  }
}
