// src/Modules/cultivos/cultivos.service.ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cultivo } from '../../Entidades/entities/Cultivo';
import { Lote } from '../../Entidades/entities/Lote';
import { CreateCultivoDto, UpdateCultivoDto } from '../../dto/cultivo.dto';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { BaseOfflineService } from '../../common/base-offline.service';
import { PlanService } from '../../auth/plan.service';

@Injectable()
export class CultivosService extends BaseOfflineService<Cultivo> {
  constructor(
    @InjectRepository(Cultivo) repo: Repository<Cultivo>,
    cache: CacheService,
    offlineQueue: OfflineQueueService,
    sync: SyncService,
    private readonly planes: PlanService,
  ) {
    super(repo, cache, offlineQueue, sync, 'cultivo', 'idcultivo');
  }

  findAll() {
    return this.findAllOffline(() =>
      this.repo.createQueryBuilder('cultivo')
        .leftJoinAndSelect('cultivo.idlote', 'lote')
        .leftJoinAndSelect('cultivo.idadminsupervisor', 'admin')
        .where('cultivo.idfinca = :f', { f: this.idfinca })
        .getMany(),
    );
  }

  findOne(id: number) {
    return this.findOneOffline(id, () =>
      this.repo.findOne({ where: this.where({ idcultivo: id }), relations: ['idlote', 'idadminsupervisor'] }),
    );
  }

  /** RNF-05: la cosecha estimada debe ser posterior a la siembra. */
  private validarFechas(siembra?: string | null, cosecha?: string | null) {
    if (siembra && cosecha && new Date(cosecha) < new Date(siembra)) {
      throw new BadRequestException('La fecha de cosecha estimada no puede ser anterior a la de siembra');
    }
  }

  /** RF-03: el plan Freemium limita la cantidad de cultivos (Premium: ilimitado). */
  private async validarLimitePlan() {
    const plan = await this.planes.getPlan(this.idfinca);
    if (plan.maxcultivos === null) return;
    const total = await this.repo.count({ where: this.where() });
    if (total >= plan.maxcultivos) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'LIMITE_PLAN_CULTIVOS',
        message: `El plan Freemium permite hasta ${plan.maxcultivos} cultivos. Actualiza a Premium para registrar más.`,
      });
    }
  }

  /** CU-06: el responsable debe ser un ADMINISTRADOR de esta finca. */
  private async validarSupervisor(idadmin?: number) {
    if (!idadmin) return;
    const r = await this.repo.manager.query(
      `SELECT 1 FROM finca_usuario WHERE idfinca = $1 AND idusuario = $2 AND rol = 'admin' AND activo = true`,
      [this.idfinca, idadmin],
    );
    if (!r.length) throw new NotFoundException('El supervisor no es administrador de esta finca');
  }

  private async validarLote(idlote?: number) {
    if (idlote) await this.assertEnFinca(this.repo.manager.getRepository(Lote), { idlote }, 'El lote');
  }

  create(dto: CreateCultivoDto) {
    this.validarFechas(dto.fechasiembra, dto.fechacosechaestimada);
    return this.createOffline(dto, async () => {
      await this.validarLimitePlan();
      await this.validarLote(dto.idlote);
      await this.validarSupervisor(dto.idadminsupervisor);
      const entity = this.repo.create({
        ...this.withFinca(dto),
        idlote:            dto.idlote            ? { idlote: dto.idlote }               as any : undefined,
        idadminsupervisor: dto.idadminsupervisor ? { idusuario: dto.idadminsupervisor } as any : undefined,
      });
      return this.repo.save(entity);
    });
  }

  update(id: number, dto: UpdateCultivoDto) {
    this.validarFechas(dto.fechasiembra, dto.fechacosechaestimada);
    return this.updateOffline(id, dto, async () => {
      const entity = await this.repo.findOneBy(this.where({ idcultivo: id }));
      if (!entity) throw new NotFoundException(`cultivo #${id} no existe en esta finca`);
      await this.validarLote(dto.idlote);
      await this.validarSupervisor(dto.idadminsupervisor);
      Object.assign(entity, {
        ...this.sinFinca(dto),
        idlote:            dto.idlote            ? { idlote: dto.idlote }               as any : entity.idlote,
        idadminsupervisor: dto.idadminsupervisor ? { idusuario: dto.idadminsupervisor } as any : entity.idadminsupervisor,
      });
      this.validarFechas(entity.fechasiembra, entity.fechacosechaestimada);
      return this.repo.save(entity);
    });
  }

  remove(id: number) {
    return this.removeOffline(id, () => this.deleteEnFinca(id));
  }
}
