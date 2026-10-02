// src/Modules/insumos/insumos.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Insumo } from '../../Entidades/entities/Insumo';
import { CompraInsumo } from '../../Entidades/entities/CompraInsumo';
import { CreateCompraInsumoDto, CreateInsumoDto, UpdateInsumoDto } from '../../dto/insumo.dto';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { BaseOfflineService } from '../../common/base-offline.service';
import { MailService } from '../../mail/mail.service';
import { TenantContext } from '../../auth/tenant-context';
import { hoyISO } from '../../common/sql';

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

  /** RNF-04: stock, mínimo y costo deben ser >= 0. */
  private validarNumeros(dto: { stockactual?: number; stockminimo?: number; costounitario?: number }) {
    for (const [campo, valor] of Object.entries({
      stockactual: dto.stockactual, stockminimo: dto.stockminimo, costounitario: dto.costounitario,
    })) {
      if (valor !== undefined && valor !== null && !(Number(valor) >= 0)) {
        throw new BadRequestException(`${campo} debe ser mayor o igual a cero`);
      }
    }
  }

  findAll() {
    return this.findAllOffline(() =>
      this.repo.find({
        where: this.where(),
        relations: ['idadminregistro', 'idadminregistro.idusuario2'],
      }),
    );
  }

  findOne(id: number) {
    return this.findOneOffline(id, () =>
      this.repo.findOne({
        where: this.where({ idinsumo: id }),
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
      .where('insumo.idfinca = :f', { f: this.idfinca })
      .andWhere('insumo.stockactual <= insumo.stockminimo')
      .getMany();
  }

  create(dto: CreateInsumoDto) {
    this.validarNumeros(dto);
    // Quién registra lo define el token, no el cliente
    const data = { ...dto, idadminregistro: TenantContext.requireUser().idusuario };
    return this.createOffline(data, () => {
      const entity = this.repo.create({
        ...this.withFinca(data),
        idadminregistro: { idusuario: data.idadminregistro } as any,
      });
      return this.repo.save(entity);
    });
  }

  // ── update con verificación de stock ──────────────────────────────────────
  async update(id: number, dto: UpdateInsumoDto) {
    this.validarNumeros(dto);
    // idadminregistro (quién lo registró) y emailAdminLogueado no se aceptan del cliente
    const { idadminregistro: _r, emailAdminLogueado: _e, ...cambios } = dto as any;

    const online = await this.sync.isOnline();

    if (!online) {
      // Offline: encola y retorna, sin verificación de stock
      return this.updateOffline(id, cambios, async () => {
        const entity = await this.repo.findOneBy(this.where({ idinsumo: id }));
        if (!entity) throw new NotFoundException(`insumo #${id} no existe en esta finca`);
        Object.assign(entity, this.sinFinca(cambios));
        return this.repo.save(entity);
      });
    }

    // ── Online: guarda, luego lee el estado REAL de la BD y verifica ───────
    const entity = await this.repo.findOneBy(this.where({ idinsumo: id }));
    if (!entity) throw new NotFoundException(`insumo #${id} no existe en esta finca`);
    Object.assign(entity, {
      ...this.sinFinca(cambios),
      // Convertimos explícitamente a número para evitar que el body HTTP
      // traiga strings ("90") y rompa la comparación posterior
      stockactual: cambios.stockactual !== undefined ? Number(cambios.stockactual) : entity.stockactual,
      stockminimo: cambios.stockminimo !== undefined ? Number(cambios.stockminimo) : entity.stockminimo,
    });
    const saved = await this.repo.save(entity);
    this.updateCacheList(saved);

    // Lee el insumo con relaciones para obtener el email del admin
    const insumoFresco = await this.repo.findOne({
      where: this.where({ idinsumo: id }),
      relations: ['idadminregistro', 'idadminregistro.idusuario2'],
    });

    if (insumoFresco) {
      const stockActual = Number(insumoFresco.stockactual ?? 0);
      const stockMinimo = Number(insumoFresco.stockminimo ?? 0);
      const emailAdmin =
        (insumoFresco as any).idadminregistro?.idusuario2?.email ||
        TenantContext.user()?.email ||
        '';

      this.logger.log(
        `📦 Insumo "${insumoFresco.nombre}" — stock: ${stockActual} | mínimo: ${stockMinimo} | admin: ${emailAdmin || '(sin email)'}`,
      );

      if (stockActual <= stockMinimo) {
        if (emailAdmin) {
          this.logger.log(`⚠️ Stock bajo → enviando correo a ${emailAdmin}`);
          await this.mailService.notificarStockBajo(emailAdmin, {
            nombreInsumo:  insumoFresco.nombre       ?? 'Sin nombre',
            tipo:          insumoFresco.tipo,
            stockActual,
            stockMinimo,
            unidadMedida:  insumoFresco.unidadmedida ?? '',
            cantidadUsada: 0,
          });
        } else {
          this.logger.warn(`⚠️ Stock bajo en "${insumoFresco.nombre}" pero el admin no tiene email`);
        }
      } else {
        this.logger.log(`✅ Stock de "${insumoFresco.nombre}" recuperado (${stockActual} > ${stockMinimo})`);
      }
    }

    return saved;
  }

  remove(id: number) {
    return this.removeOffline(id, () => this.deleteEnFinca(id));
  }

  // ── CU-15 · Compras de insumos ────────────────────────────────────────────
  /** Registra la compra y suma al stock en una sola transacción (si falla el stock, no se guarda la compra). */
  async registrarCompra(idinsumo: number, dto: CreateCompraInsumoDto) {
    if (!(await this.sync.isOnline())) {
      throw new ServiceUnavailableException('Registrar compras requiere conexión a internet');
    }
    const user = TenantContext.requireUser();
    const idfinca = this.idfinca;

    const compra = await this.repo.manager.transaction(async (m) => {
      const insumo = await m.findOne(Insumo, {
        where: { idinsumo, idfinca },
        lock: { mode: 'pessimistic_write' },
      });
      if (!insumo) throw new NotFoundException(`insumo #${idinsumo} no existe en esta finca`);

      const guardada = await m.save(
        CompraInsumo,
        m.create(CompraInsumo, {
          idfinca,
          idinsumo,
          cantidad: dto.cantidad,
          costounitario: dto.costounitario,
          fechacompra: dto.fechacompra ?? hoyISO(),
          proveedor: dto.proveedor ?? null,
          idadminregistro: user.idusuario,
        }),
      );

      insumo.stockactual = Number(insumo.stockactual ?? 0) + dto.cantidad;
      insumo.fechaultimaactualizacion = hoyISO();
      if (dto.actualizarCostoUnitario) insumo.costounitario = dto.costounitario;
      const actualizado = await m.save(Insumo, insumo);
      this.updateCacheList(actualizado);

      // Relee para traer costototal (columna generada por la BD)
      return m.findOneByOrFail(CompraInsumo, { idcompra: guardada.idcompra });
    });

    return compra;
  }

  listarCompras(idinsumo?: number) {
    return this.repo.manager.getRepository(CompraInsumo).find({
      where: this.where(idinsumo ? { idinsumo } : {}),
      order: { fechacompra: 'DESC', idcompra: 'DESC' },
    });
  }
}
