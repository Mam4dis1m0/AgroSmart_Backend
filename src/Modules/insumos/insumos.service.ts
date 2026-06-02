// src/Modules/insumos/insumos.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Insumo } from '../../Entidades/entities/Insumo';
import { CreateInsumoDto, UpdateInsumoDto } from '../../dto/insumo.dto';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { BaseOfflineService } from '../../common/base-offline.service';
import { MailService } from '../../mail/mail.service';

@Injectable()
export class InsumosService extends BaseOfflineService<Insumo> {

  constructor(
    @InjectRepository(Insumo) repo: Repository<Insumo>,
    cache: CacheService,
    offlineQueue: OfflineQueueService,
    sync: SyncService,
    private readonly mailService: MailService,
  ) {
    super(repo, cache, offlineQueue, sync, 'insumo', 'idinsumo');
  }

  findAll() {
    return this.findAllOffline(() =>
      this.repo.find({ relations: ['idadminregistro', 'idadminregistro.idusuario2'] }),
    );
  }

  findOne(id: number) {
    return this.findOneOffline(id, () =>
      this.repo.findOne({
        where: { idinsumo: id },
        relations: ['idadminregistro', 'idadminregistro.idusuario2'],
      }),
    );
  }

  async findStockBajo() {
    const online = await this.sync.isOnline();
    if (!online) {
      const all = this.cache.get<Insumo[]>(this.cacheKeyAll()) ?? [];
      return all.filter((i: any) => Number(i.stockactual) <= Number(i.stockminimo));
    }
    return this.repo
      .createQueryBuilder('insumo')
      .where('insumo.stockactual <= insumo.stockminimo')
      .getMany();
  }

  create(dto: CreateInsumoDto) {
    return this.createOffline(dto, () => {
      const entity = this.repo.create({
        ...dto,
        idadminregistro: dto.idadminregistro
          ? ({ idusuario: dto.idadminregistro } as any)
          : undefined,
      });
      return this.repo.save(entity);
    });
  }

  // ── update con verificación de stock ──────────────────────────────────────
  async update(id: number, dto: UpdateInsumoDto) {

    // ── Solo online puede verificar y mandar correo ────────────────────────
    const online = await this.sync.isOnline();

    if (!online) {
      // Offline: encola y retorna, sin verificación de stock
      return this.updateOffline(id, dto, async () => {
        const entity = await this.repo.findOneByOrFail({ idinsumo: id });
        Object.assign(entity, {
          ...dto,
          idadminregistro: dto.idadminregistro
            ? ({ idusuario: dto.idadminregistro } as any)
            : entity.idadminregistro,
        });
        return this.repo.save(entity);
      });
    }

    // ── Online: guarda, luego lee el estado REAL de la BD y verifica ───────
    // Hacemos el update directamente (sin pasar por updateOffline) para poder
    // leer el insumo con relaciones en un solo query después del save.
    const entity = await this.repo.findOneByOrFail({ idinsumo: id });
    Object.assign(entity, {
      ...dto,
      // Convertimos explícitamente a número para evitar que el body HTTP
      // traiga strings ("90") y rompa la comparación posterior
      stockactual: dto.stockactual !== undefined ? Number(dto.stockactual) : entity.stockactual,
      stockminimo: dto.stockminimo !== undefined ? Number(dto.stockminimo) : entity.stockminimo,
      idadminregistro: dto.idadminregistro
        ? ({ idusuario: dto.idadminregistro } as any)
        : entity.idadminregistro,
    });
    const saved = await this.repo.save(entity);

    // Actualiza caché
    this.updateCacheList(saved);

    // Lee el insumo con relaciones para obtener el email del admin
    const insumoFresco = await this.repo.findOne({
      where: { idinsumo: id },
      relations: ['idadminregistro', 'idadminregistro.idusuario2'],
    });
if (insumoFresco) {
  const stockActual = Number(insumoFresco.stockactual ?? 0);
  const stockMinimo = Number(insumoFresco.stockminimo ?? 0);
  const emailAdmin  = (insumoFresco as any).idadminregistro?.idusuario2?.email ?? '';

  this.logger.log(
    `📦 Insumo "${insumoFresco.nombre}" — stock: ${stockActual} | mínimo: ${stockMinimo} | admin: ${emailAdmin || '(sin email)'}`,
  );

  if (stockActual <= stockMinimo) {
    // Stock sigue bajo después de actualizar → manda correo
    if (emailAdmin) {
      this.logger.log(`⚠️ Stock bajo → enviando correo a ${emailAdmin}`);
      await this.mailService.notificarStockBajo(
        emailAdmin,
        {
          nombreInsumo: insumoFresco.nombre       ?? 'Sin nombre',
          tipo:         insumoFresco.tipo,
          stockActual,
          stockMinimo,
          unidadMedida: insumoFresco.unidadmedida ?? '',
          cantidadUsada: 0,
        },
      );
    } else {
      this.logger.warn(`⚠️ Stock bajo en "${insumoFresco.nombre}" pero el admin no tiene email`);
    }
  } else {
    // ── Stock subió por encima del mínimo → log informativo ───────────────
    this.logger.log(
      `✅ Stock de "${insumoFresco.nombre}" recuperado (${stockActual} > ${stockMinimo})`,
    );
  }
}
   

    return saved;
  }

  remove(id: number) {
    return this.removeOffline(id, () => this.repo.delete(id).then(() => {}));
  }
}