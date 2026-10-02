// src/Modules/detalle-tarea/detalle-tarea.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DetalleTarea } from '../../Entidades/entities/DetalleTarea';
import { Insumo } from '../../Entidades/entities/Insumo';
import { Tarea } from '../../Entidades/entities/Tarea';
import { CreateDetalleTareaDto, UpdateDetalleTareaDto } from '../../dto/detalle-tarea.dto';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { BaseOfflineService } from '../../common/base-offline.service';
import { MailService } from '../../mail/mail.service';
import { TenantContext } from '../../auth/tenant-context';
import { filas } from '../../common/sql';

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
      this.repo.find({ where: this.where(), relations: ['idtarea', 'idinsumo'] }),
    );
  }

  findOne(id: number) {
    return this.findOneOffline(id, () =>
      this.repo.findOne({ where: this.where({ iddetalletarea: id }), relations: ['idtarea', 'idinsumo'] }),
    );
  }

  async findByTarea(idtarea: number) {
    const online = await this.sync.isOnline();
    if (!online) {
      const all = this.cache.get<DetalleTarea[]>(this.cacheKeyAll()) ?? [];
      return all.filter((d: any) => d.idtarea?.idtarea === idtarea || d.idtarea === idtarea);
    }
    return this.repo.find({ where: this.where({ idtarea }), relations: ['idinsumo'] });
  }

  private async validarReferencias(dto: { idinsumo?: number; idtarea?: number }) {
    if (dto.idinsumo) await this.assertEnFinca(this.insumoRepo, { idinsumo: dto.idinsumo }, 'El insumo');
    if (dto.idtarea) {
      await this.assertEnFinca(this.repo.manager.getRepository(Tarea), { idtarea: dto.idtarea }, 'La tarea');
    }
  }

  // ── CREATE: descuenta stock y avisa si queda bajo ─────────────────────────
  async create(dto: CreateDetalleTareaDto) {
    const online = await this.sync.isOnline();

    if (online && dto.idinsumo && dto.cantidadusada) {
      const cantidad = Number(dto.cantidadusada);
      if (!(cantidad > 0)) throw new BadRequestException('La cantidad usada debe ser mayor que cero');

      await this.validarReferencias(dto);
      const idfinca = this.idfinca;

      // El descuento es UN solo UPDATE condicionado (stock >= cantidad): dos tareas que consuman
      // el mismo insumo a la vez no pueden dejar el stock negativo (RNF-04).
      const saved = await this.repo.manager.transaction(async (m) => {
        const upd = filas<{ stockactual: number }>(
          await m.query(
            `UPDATE insumo
                SET stockactual = stockactual - $1,
                    fechaultimaactualizacion = CURRENT_DATE
              WHERE idinsumo = $2 AND idfinca = $3 AND stockactual >= $1
          RETURNING stockactual`,
            [cantidad, dto.idinsumo, idfinca],
          ),
        );
        if (upd.length === 0) {
          throw new BadRequestException('Stock insuficiente para registrar este consumo');
        }

        const entity = m.create(DetalleTarea, {
          ...this.withFinca(dto),
          idinsumo: { idinsumo: dto.idinsumo } as any,
          idtarea:  dto.idtarea ? { idtarea: dto.idtarea } as any : undefined,
        });
        return m.save(DetalleTarea, entity);
      });

      // Insumo con el stock ya descontado (para caché y aviso por correo)
      const insumo = await this.insumoRepo.findOne({
        where: this.where({ idinsumo: dto.idinsumo }),
        relations: ['idadminregistro', 'idadminregistro.idusuario2'],
      });

      if (insumo) {
        this.updateCacheListDeInsumo(insumo);
        const stockNuevo = Number(insumo.stockactual ?? 0);
        const stockMin   = Number(insumo.stockminimo ?? 0);

        this.logger.log(
          `📦 Insumo #${dto.idinsumo} "${insumo.nombre}": ${stockNuevo + cantidad} → ${stockNuevo} ${insumo.unidadmedida ?? ''}`,
        );

        // Avisar por correo si quedó bajo el mínimo
        if (stockNuevo < stockMin) {
          const emailAdmin =
            (insumo.idadminregistro as any)?.idusuario2?.email || TenantContext.user()?.email || null;
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
      }

      return saved;
    }

    // Fallback offline o sin idinsumo
    return this.createOffline(dto, async () => {
      await this.validarReferencias(dto);
      const entity = this.repo.create({
        ...this.withFinca(dto),
        idinsumo: dto.idinsumo ? { idinsumo: dto.idinsumo } as any : undefined,
        idtarea:  dto.idtarea  ? { idtarea:  dto.idtarea }  as any : undefined,
      });
      return this.repo.save(entity);
    });
  }

  /**
   * Refleja el stock nuevo en el caché de insumos: el del usuario actual y el de la
   * vista del administrador de la finca (las claves llevan la finca, ver tenantTag()).
   */
  private updateCacheListDeInsumo(insumo: Insumo) {
    const prefijos = new Set([`insumo_${this.tenantTag()}`, `insumo_f${this.idfinca}`]);
    for (const prefijo of prefijos) {
      const todos: any[] = this.cache.get<any[]>(`${prefijo}_all`) ?? [];
      this.cache.set(`${prefijo}_all`, todos.map((i: any) => (i.idinsumo === insumo.idinsumo ? insumo : i)));
      const uno = this.cache.get<any>(`${prefijo}_${insumo.idinsumo}`);
      if (uno) this.cache.set(`${prefijo}_${insumo.idinsumo}`, insumo);
    }
  }

  update(id: number, dto: UpdateDetalleTareaDto) {
    return this.updateOffline(id, dto, async () => {
      const entity = await this.repo.findOneBy(this.where({ iddetalletarea: id }));
      if (!entity) throw new NotFoundException(`detalle_tarea #${id} no existe en esta finca`);
      await this.validarReferencias(dto);
      Object.assign(entity, {
        ...this.sinFinca(dto),
        idinsumo: dto.idinsumo ? { idinsumo: dto.idinsumo } as any : entity.idinsumo,
        idtarea:  dto.idtarea  ? { idtarea:  dto.idtarea }  as any : entity.idtarea,
      });
      return this.repo.save(entity);
    });
  }

  remove(id: number) {
    return this.removeOffline(id, () => this.deleteEnFinca(id));
  }
}
