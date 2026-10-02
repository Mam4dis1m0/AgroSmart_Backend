// src/Modules/empleado-cosecha/empleado-cosecha.service.ts
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmpleadoCosecha } from '../../Entidades/entities/EmpleadoCosecha';
import { CreateEmpleadoCosechaDto, UpdateEmpleadoCosechaDto } from '../../dto/empleado-cosecha.dto';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { BaseOfflineService } from '../../common/base-offline.service';
import { TenantContext } from '../../auth/tenant-context';

@Injectable()
export class EmpleadoCosechaService extends BaseOfflineService<EmpleadoCosecha> {
  constructor(
    @InjectRepository(EmpleadoCosecha) repo: Repository<EmpleadoCosecha>,
    cache: CacheService,
    offlineQueue: OfflineQueueService,
    sync: SyncService,
  ) {
    super(repo, cache, offlineQueue, sync, 'empleado_cosecha', 'idempleadocosecha');
  }

  /** Un empleado solo ve su propio trabajo; el administrador ve toda la finca. */
  private soloMio(): number | null {
    const u = TenantContext.requireUser();
    return u.rol === 'empleado' ? u.idusuario : null;
  }

  findAll() {
    const mio = this.soloMio();
    return this.findAllOffline(() =>
      this.repo.find({
        where: this.where(mio !== null ? { idempleado: mio } : {}),
        relations: ['idempleado'],
      }),
    );
  }

  findOne(id: number) {
    const mio = this.soloMio();
    return this.findOneOffline(id, () =>
      this.repo.findOne({
        where: this.where({ idempleadocosecha: id, ...(mio !== null ? { idempleado: mio } : {}) }),
        relations: ['idempleado'],
      }),
    );
  }

  async findByEmpleado(idempleado: number) {
    const mio = this.soloMio();
    if (mio !== null && mio !== idempleado) {
      throw new ForbiddenException('Solo puedes consultar tu propio registro de cosechas');
    }
    const online = await this.sync.isOnline();
    if (!online) {
      const all = this.cache.get<EmpleadoCosecha[]>(this.cacheKeyAll()) ?? [];
      return all.filter((e: any) => e.idempleado?.idusuario === idempleado || e.idempleado === idempleado);
    }
    return this.repo.find({
      where: this.where({ idempleado }),
      relations: ['idempleado'],
    });
  }

  create(dto: CreateEmpleadoCosechaDto) {
    return this.createOffline(dto, async () => {
      if (dto.idempleado) await this.exigirEmpleadoDeFinca(dto.idempleado);
      const entity = this.repo.create({
        ...this.withFinca(dto),
        idempleado: dto.idempleado ? { idusuario: dto.idempleado } as any : undefined,
      });
      return this.repo.save(entity);
    });
  }

  update(id: number, dto: UpdateEmpleadoCosechaDto) {
    return this.updateOffline(id, dto, async () => {
      const entity = await this.repo.findOneBy(this.where({ idempleadocosecha: id }));
      if (!entity) throw new NotFoundException(`empleado_cosecha #${id} no existe en esta finca`);
      if (dto.idempleado) await this.exigirEmpleadoDeFinca(dto.idempleado);
      Object.assign(entity, {
        ...this.sinFinca(dto),
        idempleado: dto.idempleado ? { idusuario: dto.idempleado } as any : entity.idempleado,
      });
      return this.repo.save(entity);
    });
  }

  remove(id: number) {
    return this.removeOffline(id, () => this.deleteEnFinca(id));
  }

  private async exigirEmpleadoDeFinca(idempleado: number) {
    const r = await this.repo.manager.query(
      `SELECT 1 FROM finca_usuario WHERE idfinca = $1 AND idusuario = $2 AND rol = 'empleado' AND activo = true`,
      [this.idfinca, idempleado],
    );
    if (!r.length) throw new NotFoundException('El empleado no pertenece a esta finca');
  }
}
