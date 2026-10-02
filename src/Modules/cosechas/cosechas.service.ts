// src/Modules/cosechas/cosechas.service.ts
//
// CU-16 · Registro de cosechas por cultivo. La cosecha excedente puede publicarse luego
// en el Marketplace (CU-29). Sigue el mismo patrón offline-first que los demás módulos.

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cosecha } from '../../Entidades/entities/Cosecha';
import { Cultivo } from '../../Entidades/entities/Cultivo';
import { CreateCosechaDto, UpdateCosechaDto } from '../../dto/cosecha.dto';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { BaseOfflineService } from '../../common/base-offline.service';
import { TenantContext } from '../../auth/tenant-context';

@Injectable()
export class CosechasService extends BaseOfflineService<Cosecha> {
  constructor(
    @InjectRepository(Cosecha) repo: Repository<Cosecha>,
    cache: CacheService,
    offlineQueue: OfflineQueueService,
    sync: SyncService,
  ) {
    super(repo, cache, offlineQueue, sync, 'cosecha', 'idcosecha');
  }

  findAll() {
    return this.findAllOffline(() =>
      this.repo.find({ where: this.where(), order: { fechacosecha: 'DESC', idcosecha: 'DESC' } }),
    );
  }

  findOne(id: number) {
    return this.findOneOffline(id, () => this.repo.findOneBy(this.where({ idcosecha: id })));
  }

  async findByCultivo(idcultivo: number) {
    const online = await this.sync.isOnline();
    if (!online) {
      const all = this.cache.get<Cosecha[]>(this.cacheKeyAll()) ?? [];
      return all.filter((c: any) => c.idcultivo === idcultivo);
    }
    return this.repo.find({ where: this.where({ idcultivo }), order: { fechacosecha: 'DESC' } });
  }

  /** RNF-05: la cosecha no puede ser anterior a la siembra. Devuelve el cultivo validado. */
  private async validarCultivo(idcultivo: number, fechacosecha: string): Promise<void> {
    const cultivo = await this.repo.manager.getRepository(Cultivo).findOneBy({ idcultivo, idfinca: this.idfinca });
    if (!cultivo) throw new NotFoundException('El cultivo no existe en esta finca');
    if (cultivo.fechasiembra && new Date(fechacosecha) < new Date(cultivo.fechasiembra)) {
      throw new BadRequestException('La fecha de cosecha no puede ser anterior a la fecha de siembra del cultivo');
    }
  }

  create(dto: CreateCosechaDto) {
    const data = { ...dto, idadminregistro: TenantContext.requireUser().idusuario };
    return this.createOffline(data, async () => {
      await this.validarCultivo(dto.idcultivo, dto.fechacosecha);
      return this.repo.save(this.repo.create(this.withFinca(data)));
    });
  }

  update(id: number, dto: UpdateCosechaDto) {
    return this.updateOffline(id, dto, async () => {
      const actual = await this.repo.findOneBy(this.where({ idcosecha: id }));
      if (!actual) throw new NotFoundException(`cosecha #${id} no existe en esta finca`);
      if (dto.fechacosecha) await this.validarCultivo(actual.idcultivo, dto.fechacosecha);
      return this.updateEnFinca(id, dto);
    });
  }

  remove(id: number) {
    return this.removeOffline(id, () => this.deleteEnFinca(id));
  }
}
