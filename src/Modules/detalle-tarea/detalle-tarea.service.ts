// src/Modules/detalle-tarea/detalle-tarea.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DetalleTarea } from '../../Entidades/entities/DetalleTarea';
import { Insumo } from '../../Entidades/entities/Insumo';
import { CreateDetalleTareaDto, UpdateDetalleTareaDto } from '../../dto/detalle-tarea.dto';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { BaseOfflineService } from '../../common/base-offline.service';
import { MailService } from '../../mail/mail.service';

@Injectable()
export class DetalleTareaService extends BaseOfflineService<DetalleTarea> {
  // ERROR 1 CORREGIDO: NO redeclarar 'logger' aquí porque ya viene de BaseOfflineService
  // como 'protected'. Redeclararla como 'private' causa el conflicto ts(2415).

  constructor(
    @InjectRepository(DetalleTarea) repo: Repository<DetalleTarea>,
    @InjectRepository(Insumo) private insumoRepo: Repository<Insumo>,
    private mailService: MailService,
    cache: CacheService,
    offlineQueue: OfflineQueueService,
    sync: SyncService,
  ) {
    super(repo, cache, offlineQueue, sync, 'detalle_tarea', 'iddetalletarea');
  }

  findAll() {
    return this.findAllOffline(() =>
      this.repo.find({ relations: ['idtarea', 'idinsumo'] }),
    );
  }

  findOne(id: number) {
    return this.findOneOffline(id, () =>
      this.repo.findOne({ where: { iddetalletarea: id }, relations: ['idtarea', 'idinsumo'] }),
    );
  }

  async findByTarea(idtarea: number) {
    const online = await this.sync.isOnline();
    if (!online) {
      const all = this.cache.get<DetalleTarea[]>(this.cacheKeyAll()) ?? [];
      return all.filter((d: any) => d.idtarea?.idtarea === idtarea || d.idtarea === idtarea);
    }
    return this.repo.find({ where: { idtarea: { idtarea } as any }, relations: ['idinsumo'] });
  }

  // ── CREATE: descuenta stock y avisa si queda bajo ─────────────────────────
  async create(dto: CreateDetalleTareaDto) {
    const online = await this.sync.isOnline();

    if (online && dto.idinsumo && dto.cantidadusada) {
      const insumo = await this.insumoRepo.findOne({
        where: { idinsumo: dto.idinsumo },
        relations: ['idadminregistro', 'idadminregistro.idusuario2'],
      });

      if (insumo) {
        const stockAntes = Number(insumo.stockactual ?? 0);
        const cantidad   = Number(dto.cantidadusada);
        const stockNuevo = stockAntes - cantidad;

        // Guardar el detalle
        const entity = this.repo.create({
          ...dto,
          idinsumo: { idinsumo: dto.idinsumo } as any,
          idtarea:  dto.idtarea ? { idtarea: dto.idtarea } as any : undefined,
        });
        const saved = await this.repo.save(entity);

        // Descontar stock en la BD
        await this.insumoRepo.update(dto.idinsumo, {
          stockactual:              stockNuevo,
          fechaultimaactualizacion: new Date().toISOString().split('T')[0],
        });

        // Actualizar cache
        const cached = this.cache.get<any>(`insumo_${dto.idinsumo}`);
        if (cached) this.cache.set(`insumo_${dto.idinsumo}`, { ...cached, stockactual: stockNuevo });
        const allInsumos = (this.cache.get<any[]>('insumo_all') ?? []).map((i: any) =>
          i.idinsumo === dto.idinsumo ? { ...i, stockactual: stockNuevo } : i,
        );
        this.cache.set('insumo_all', allInsumos);

        this.logger.log(
          `📦 Insumo #${dto.idinsumo} "${insumo.nombre}": ${stockAntes} → ${stockNuevo} ${insumo.unidadmedida ?? ''}`,
        );

        // Avisar por correo si quedó bajo el mínimo
        const stockMin = Number(insumo.stockminimo ?? 0);
        if (stockNuevo < stockMin) {
          const emailAdmin = (insumo.idadminregistro as any)?.idusuario2?.email ?? null;
          if (emailAdmin) {
            await this.mailService.notificarStockBajo(emailAdmin, {
              nombreInsumo:  insumo.nombre ?? 'Sin nombre',
              tipo:          insumo.tipo,
              stockActual:   stockNuevo,
              stockMinimo:   stockMin,
              unidadMedida:  insumo.unidadmedida,
              cantidadUsada: cantidad,
            });
            this.logger.warn(`⚠️ Stock bajo notificado para insumo "${insumo.nombre}"`);
          }
        }

        return saved;
      }
    }

    // Fallback offline o sin idinsumo
    return this.createOffline(dto, () => {
      const entity = this.repo.create({
        ...dto,
        idinsumo: dto.idinsumo ? { idinsumo: dto.idinsumo } as any : undefined,
        idtarea:  dto.idtarea  ? { idtarea:  dto.idtarea }  as any : undefined,
      });
      return this.repo.save(entity);
    });
  }

  update(id: number, dto: UpdateDetalleTareaDto) {
    return this.updateOffline(id, dto, async () => {
      const entity = await this.repo.findOneByOrFail({ iddetalletarea: id });
      Object.assign(entity, {
        ...dto,
        idinsumo: dto.idinsumo ? { idinsumo: dto.idinsumo } as any : entity.idinsumo,
        idtarea:  dto.idtarea  ? { idtarea:  dto.idtarea }  as any : entity.idtarea,
      });
      return this.repo.save(entity);
    });
  }

  remove(id: number) {
    return this.removeOffline(id, () => this.repo.delete(id).then(() => {}));
  }
}