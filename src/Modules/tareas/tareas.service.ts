import { Injectable, NotFoundException, Logger } from '@nestjs/common';
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
import { MailService } from '../../mail/mail.service';
import { CacheService } from '../../common/cache.service';
import { Insumo } from '../../Entidades/entities/Insumo';
import { DetalleTarea } from '../../Entidades/entities/DetalleTarea';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';

@Injectable()
export class TareasService {
  private readonly logger = new Logger(TareasService.name);

  constructor(
    @InjectRepository(Tarea) private repo: Repository<Tarea>,
    @InjectRepository(Empleado) private empleadoRepo: Repository<Empleado>,
    @InjectRepository(AsignacionTarea)
    private asignacionRepo: Repository<AsignacionTarea>,
    @InjectRepository(Insumo) private insumoRepo: Repository<Insumo>,
    @InjectRepository(DetalleTarea)
    private detalleRepo: Repository<DetalleTarea>,
    private mailService: MailService,
    private cache: CacheService,
    private offlineQueue: OfflineQueueService,
    private sync: SyncService,
  ) {}

  // ── findAll ───────────────────────────────────────────────────────────────
  async findAll() {
    const CACHE_KEY = 'tareas_all';
    const online = await this.sync.isOnline();

    if (!online) {
      this.logger.warn('📴 Sin internet — devolviendo tareas desde caché');
      return this.cache.get<Tarea[]>(CACHE_KEY) ?? [];
    }

    const tareas = await this.repo
      .createQueryBuilder('tarea')
      .leftJoinAndSelect('tarea.idadmincreador', 'admin')
      .leftJoinAndSelect('tarea.idcultivo', 'cultivo')
      .leftJoinAndSelect('tarea.asignacionTareas', 'asig')
      .leftJoinAndSelect('asig.idempleado', 'empleado')
      .leftJoinAndSelect('empleado.idusuario2', 'usuario')
      .getMany();

    const pending = (this.cache.get<any[]>(CACHE_KEY) ?? []).filter(t => t._offline === true);
    const supabaseIds = new Set(tareas.map(t => String(t.idtarea)));
    const soloOffline = pending.filter(t => !supabaseIds.has(String(t.idtarea)));
    const merged = [...tareas, ...soloOffline];

    this.cache.set(CACHE_KEY, merged);
    return merged;
  }

  // ── findOne ───────────────────────────────────────────────────────────────
  async findOne(id: number) {
    const CACHE_KEY = `tareas_${id}`;
    const online = await this.sync.isOnline();

    if (!online) {
      this.logger.warn(`📴 Sin internet — devolviendo tarea #${id} desde caché`);
      return this.cache.get<Tarea>(CACHE_KEY) ?? null;
    }

    const tarea = await this.repo.findOne({
      where: { idtarea: id },
      relations: ['idadmincreador', 'idcultivo', 'asignacionTareas', 'asignacionTareas.idempleado', 'asignacionTareas.idempleado.idusuario2'],
    });

    if (tarea) this.cache.set(CACHE_KEY, tarea);
    return tarea;
  }

  // ── findByEstado ──────────────────────────────────────────────────────────
  async findByEstado(estado: string) {
    const CACHE_KEY = `tareas_estado_${estado}`;
    const online = await this.sync.isOnline();

    if (!online) {
      this.logger.warn(`📴 Sin internet — devolviendo tareas estado "${estado}" desde caché`);
      return this.cache.get<Tarea[]>(CACHE_KEY) ?? [];
    }

    const tareas = await this.repo.find({ where: { estado }, relations: ['idadmincreador', 'idcultivo'] });
    this.cache.set(CACHE_KEY, tareas);
    return tareas;
  }

  // ── create ────────────────────────────────────────────────────────────────
  async create(dto: CreateTareaDto) {
    const online = await this.sync.isOnline();

    if (online) {
      const entity = this.repo.create({
        ...dto,
        idadmincreador: dto.idadmincreador ? ({ idusuario: dto.idadmincreador } as any) : undefined,
        idcultivo:      dto.idcultivo      ? ({ idcultivo: dto.idcultivo }      as any) : undefined,
      });
      const saved = await this.repo.save(entity);
      const all = this.cache.get<Tarea[]>('tareas_all') ?? [];
      this.cache.set('tareas_all', [...all, saved]);
      return saved;
    }

    const tempId = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let _nombreEmpleado: string | null = null;
    if ((dto as any).idempleado) {
      const empleados: any[] = this.cache.get<any[]>('empleado_all') ?? [];
      const emp = empleados.find((e: any) => e.idusuario === (dto as any).idempleado);
      if (emp?.idusuario2) {
        _nombreEmpleado = [emp.idusuario2.primernombre, emp.idusuario2.primerapellido].filter(Boolean).join(' ');
      } else if (emp?.primernombre) {
        _nombreEmpleado = [emp.primernombre, emp.primerapellido].filter(Boolean).join(' ');
      }
    }

    const tempEntity = { idtarea: tempId, ...dto, _offline: true, _pendiente: 'CREATE', _nombreEmpleado };
    const all = this.cache.get<any[]>('tareas_all') ?? [];
    this.cache.set('tareas_all', [...all, tempEntity]);

    const dtoSinCamposExtra = Object.fromEntries(Object.entries(dto).filter(([k]) => k !== 'idempleado'));
    this.offlineQueue.add('tarea', 'CREATE', dtoSinCamposExtra);
    this.logger.log(`📥 Tarea guardada offline (id temporal: ${tempId})`);

    return { ...tempEntity, _mensaje: 'Guardado localmente. Se subirá a Supabase cuando haya internet.' };
  }

  // ── update ────────────────────────────────────────────────────────────────
 async update(id: number, dto: UpdateTareaDto) {
    const online = await this.sync.isOnline();

    if (online) {
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
      const saved = await this.repo.save(entity);
      this.cache.set(`tareas_${id}`, saved);
      const all = (this.cache.get<any[]>('tareas_all') ?? []).map((t) =>
        t.idtarea === id ? saved : t,
      );
      this.cache.set('tareas_all', all);
      return saved;
    }

    const cached = this.cache.get<any>(`tareas_${id}`);
    const updated = {
      ...(cached ?? { idtarea: id }),
      ...dto,
      _pendiente: 'UPDATE',
    };
    this.cache.set(`tareas_${id}`, updated);
    const all = (this.cache.get<any[]>('tareas_all') ?? []).map((t) =>
      t.idtarea === id ? updated : t,
    );
    this.cache.set('tareas_all', all);
    this.offlineQueue.add('tarea', 'UPDATE', { idtarea: id, ...dto });
    this.logger.log(`📥 Tarea #${id} actualizada offline`);
    return {
      ...updated,
      _mensaje:
        'Actualizado localmente. Se subirá a Supabase cuando haya internet.',
    };
  }

  // ── remove ────────────────────────────────────────────────────────────────
   async remove(id: number) {
    const online = await this.sync.isOnline();

    if (online) {
      await this.repo.delete(id);
      this.cache.delete(`tareas_${id}`);
      const all = (this.cache.get<any[]>('tareas_all') ?? []).filter(
        (t) => t.idtarea !== id,
      );
      this.cache.set('tareas_all', all);
      return { message: 'Tarea eliminada' };
    }

    this.cache.delete(`tareas_${id}`);
    const all = (this.cache.get<any[]>('tareas_all') ?? []).filter(
      (t) => t.idtarea !== id,
    );
    this.cache.set('tareas_all', all);
    this.offlineQueue.add('tarea', 'DELETE', { idtarea: id });
    this.logger.log(`📥 Tarea #${id} marcada para eliminar offline`);
    return {
      message:
        'Eliminado localmente. Se borrará de Supabase cuando haya internet.',
    };
  }
  
  // ── asignar ───────────────────────────────────────────────────────────────
 async asignar(idTarea: number, dto: AsignarTareaDto): Promise<AsignacionTarea | any> {
  const online = await this.sync.isOnline();

  if (online) {
    const tarea = await this.repo.findOne({
      where: { idtarea: idTarea },
      relations: ['idcultivo', 'idcultivo.idlote'],
    });
    if (!tarea) throw new NotFoundException(`Tarea #${idTarea} no encontrada.`);

    const empleado = await this.empleadoRepo.findOne({
      where: { idusuario: dto.idempleado },
      relations: ['idusuario2'],
    });
    if (!empleado) throw new NotFoundException(`Empleado #${dto.idempleado} no encontrado.`);

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
        estado:           dto.estado           ?? asignacion.estado,
        pagoacordado:     dto.pagoacordado      ?? asignacion.pagoacordado,
        fechaasignacion:  dto.fechaasignacion   ?? asignacion.fechaasignacion,
        idadminasignador: { idusuario: dto.idadminasignador } as any,
      });
    } else {
      asignacion = this.asignacionRepo.create({
        fechaasignacion:  dto.fechaasignacion ?? new Date().toISOString().split('T')[0],
        estado:           dto.estado          ?? 'Asignado',
        pagoacordado:     dto.pagoacordado    ?? null,
        idtarea:          { idtarea: idTarea }                as any,
        idempleado:       { idusuario: dto.idempleado }       as any,
        idadminasignador: { idusuario: dto.idadminasignador } as any,
      });
    }

    const saved = await this.asignacionRepo.save(asignacion);

    // ── Email al empleado ────────────────────────────────────────────────
    const emailEmpleado = empleado.idusuario2?.email ?? '';
    if (emailEmpleado) {
      await this.mailService.notificarTareaAsignada(emailEmpleado, {
        nombreTarea:     tarea.tipoactividad    ?? 'Sin nombre',
        fechaProgramada: tarea.fechaprogramada  ?? null,
        pagoacordado:    dto.pagoacordado       ?? null,
      });
    }

    // ── Stock y correo admin ─────────────────────────────────────────────
    try {
      const detalles = await this.detalleRepo
        .createQueryBuilder('detalle')
        .leftJoinAndSelect('detalle.idinsumo', 'insumo')
        .where('detalle.idtarea = :idTarea', { idTarea })
        .getMany();

      // Busca email admin directo en tabla usuario
      const [adminRow] = await this.repo.manager.query(
        `SELECT email FROM usuario WHERE idusuario = $1`,
        [dto.idadminasignador],
      );
      const emailAdmin = adminRow?.email ?? '';
      this.logger.log(`👤 Admin a notificar: "${emailAdmin}"`);
      this.logger.log(`📦 Insumos en tarea #${idTarea}: ${detalles.length}`);

    for (const detalle of detalles) {
  if (!detalle.idinsumo || !detalle.cantidadusada) continue;

  // Query directa a BD — lee stock actual sin caché
  const [insumoFresco] = await this.repo.manager.query(
    `SELECT idinsumo, nombre, stockactual, stockminimo, unidadmedida, tipo
     FROM insumo WHERE idinsumo = $1`,
    [detalle.idinsumo.idinsumo],
  );
  if (!insumoFresco) continue;

  const stockActual = Number(insumoFresco.stockactual ?? 0);
  const stockMinimo = Number(insumoFresco.stockminimo ?? 0);
  const cantidadUsada = Number(detalle.cantidadusada ?? 0);

  this.logger.log(
    `📦 "${insumoFresco.nombre}": stock actual ${stockActual} (mín: ${stockMinimo})`,
  );

  // ── NO descuenta — detalle_tareaService ya lo hizo ───────────────────
  // Solo verifica si está bajo y manda correo
  if (stockActual <= stockMinimo) {
    if (emailAdmin) {
      this.logger.log(
        `⚠️ Stock bajo: "${insumoFresco.nombre}" (${stockActual} ≤ ${stockMinimo}) → email a ${emailAdmin}`,
      );
      await this.mailService.notificarStockBajo(emailAdmin, {
        nombreInsumo:  insumoFresco.nombre      ?? 'Sin nombre',
        tipo:          insumoFresco.tipo         ?? null,
        stockActual:   stockActual,
        stockMinimo:   stockMinimo,
        unidadMedida:  insumoFresco.unidadmedida ?? null,
        cantidadUsada: cantidadUsada,
      });
    } else {
      this.logger.warn(`⚠️ Stock bajo en "${insumoFresco.nombre}" pero no hay email de admin`);
    }
  }
}
    } catch (err) {
      this.logger.error(`❌ Error verificando stock: ${err.message}`);
    }

    return this.asignacionRepo.findOneOrFail({
      where: { idasigtarea: saved.idasigtarea },
      relations: ['idtarea', 'idempleado', 'idempleado.idusuario2', 'idadminasignador'],
    });
  }

  // ── Modo offline ──────────────────────────────────────────────────────────
  let nombreEmpleado = '—';
  const empleadosCache: any[] = this.cache.get<any[]>('empleado_all') ?? [];
  const empCache = empleadosCache.find((e: any) => e.idusuario === dto.idempleado);
  if (empCache?.idusuario2) {
    nombreEmpleado = [empCache.idusuario2.primernombre, empCache.idusuario2.primerapellido]
      .filter(Boolean).join(' ');
  } else if (empCache?.primernombre) {
    nombreEmpleado = [empCache.primernombre, empCache.primerapellido]
      .filter(Boolean).join(' ');
  }

  const tareasAll: any[] = this.cache.get<any[]>('tareas_all') ?? [];
  const tareasActualizadas = tareasAll.map((t: any) => {
    if (t.idtarea !== idTarea) return t;
    const asigSimulada = {
      _offline: true,
      idempleado: {
        idusuario: dto.idempleado,
        idusuario2: empCache?.idusuario2 ?? {
          primernombre:   empCache?.primernombre   ?? '—',
          primerapellido: empCache?.primerapellido ?? '',
        },
      },
      estado:          dto.estado          ?? 'Asignado',
      pagoacordado:    dto.pagoacordado    ?? null,
      fechaasignacion: dto.fechaasignacion ?? new Date().toISOString().split('T')[0],
    };
    return {
      ...t,
      _nombreEmpleado:  nombreEmpleado,
      asignacionTareas: [...(t.asignacionTareas ?? []), asigSimulada],
    };
  });

  this.cache.set('tareas_all', tareasActualizadas);
  this.offlineQueue.add('asignacion_tarea', 'CREATE', { idtarea: idTarea, ...dto });
  this.logger.log(`📥 Asignación tarea #${idTarea} encolada offline — empleado: ${nombreEmpleado}`);

  return {
    _offline:        true,
    idtarea:         idTarea,
    ...dto,
    estado:          dto.estado          ?? 'Asignado',
    fechaasignacion: dto.fechaasignacion ?? new Date().toISOString().split('T')[0],
    _nombreEmpleado: nombreEmpleado,
    _mensaje:        'Asignación guardada localmente. Se subirá cuando haya internet.',
  };
}
  // ── completar ─────────────────────────────────────────────────────────────
  // ERROR 3 CORREGIDO: notificarTareaCompletada sigue recibiendo 3 argumentos
  // (emailAdmin, nombreTarea, nombreEmpleado) — no se cambió su firma.
async completar(idAsignacion: number): Promise<AsignacionTarea> {
  const asignacion = await this.asignacionRepo.findOneOrFail({
    where: { idasigtarea: idAsignacion },
    relations: ['idtarea', 'idempleado', 'idempleado.idusuario2', 'idadminasignador', 'idadminasignador.idusuario2'],
  });

  // Actualizar asignación
  asignacion.estado = 'Completado';
  await this.asignacionRepo.save(asignacion);

  // 🔥 ACTUALIZAR LA TAREA PRINCIPAL (esto es lo que faltaba)
  if (asignacion.idtarea) {
    await this.repo.update(asignacion.idtarea.idtarea, {
      estado: 'Completado'
    });
  }

  // Email al admin
  const emailAdmin = asignacion.idadminasignador?.idusuario2?.email ?? '';
  const nombreEmpleado = asignacion.idempleado?.idusuario2?.primernombre ?? 'Empleado';
  const nombreTarea = asignacion.idtarea?.tipoactividad ?? 'Sin nombre';

  if (emailAdmin) {
    await this.mailService.notificarTareaCompletada(emailAdmin, nombreTarea, nombreEmpleado);
  }

  // Invalidar caché para que el frontend vea el cambio
  this.cache.delete(`tareas_${asignacion.idtarea?.idtarea}`);
  this.cache.delete('tareas_all');

  return asignacion;
}

async completarConEvidencia(idTarea: number, body: any, fotoPath: string | null) {
  const {
    observaciones, tipoactividad, fechaprogramada,
    nombreEmpleado, lote, idasigtarea,
  } = body;

  // 1. Completar la asignación o la tarea
  if (idasigtarea) {
    await this.completar(Number(idasigtarea));
  } else {
    await this.update(idTarea, { estado: 'Completado' } as any);
  }

  // 2. Generar PDF
  const pdfBuffer = await this.generarPDF({
    idtarea: idTarea, tipoactividad, fechaprogramada,
    nombreEmpleado, lote, observaciones, fotoPath,
  });

  // 3. Obtener email del admin desde la tarea
  const tareaConAdmin = await this.repo.findOne({
    where: { idtarea: idTarea },
    relations: ['idadmincreador', 'idadmincreador.idusuario2'],
  });
  const emailAdmin = tareaConAdmin?.idadmincreador?.idusuario2?.email ?? '';

  // 4. Enviar correo con el PDF adjunto
  if (emailAdmin) {
    await this.mailService.notificarTareaCompletadaConEvidencia(
      emailAdmin, idTarea, tipoactividad, nombreEmpleado,
      lote, fechaprogramada, observaciones, pdfBuffer,
    );
  }

  // 5. Limpiar foto temporal
  if (fotoPath) {
    const fs = await import('fs');
    fs.unlink(fotoPath, () => {});
  }

  return { ok: true, message: 'Tarea completada y correo enviado.' };
}

private async generarPDF({ idtarea, tipoactividad, fechaprogramada, nombreEmpleado, lote, observaciones, fotoPath }: any): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default;
  const fs = await import('fs');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fillColor('#16a34a').fontSize(22).font('Helvetica-Bold').text('AgroSmart', 50, 50);
    doc.fillColor('#374151').fontSize(13).font('Helvetica').text('Reporte de Tarea Completada', 50, 78);
    doc.moveTo(50, 98).lineTo(545, 98).strokeColor('#e5e7eb').lineWidth(1).stroke();

    const campo = (label: string, valor: string, y: number) => {
      doc.fillColor('#6b7280').fontSize(10).font('Helvetica').text(label, 50, y);
      doc.fillColor('#111827').fontSize(11).font('Helvetica-Bold').text(valor || '—', 180, y);
    };

    const s = 115; const lh = 22;
    campo('ID de Tarea',      `#${idtarea}`,          s);
    campo('Actividad',        tipoactividad,           s + lh);
    campo('Fecha programada', fechaprogramada,         s + lh * 2);
    campo('Empleado',         nombreEmpleado,          s + lh * 3);
    campo('Lote / Cultivo',   lote,                    s + lh * 4);
    campo('Fecha completada', new Date().toLocaleDateString('es-CO'), s + lh * 5);

    const obsY = s + lh * 7;
    doc.fillColor('#374151').fontSize(12).font('Helvetica-Bold').text('Observaciones', 50, obsY);
    doc.moveTo(50, obsY + 16).lineTo(545, obsY + 16).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
    doc.fillColor('#374151').fontSize(11).font('Helvetica').text(observaciones?.trim() || 'Sin observaciones.', 50, obsY + 24, { width: 495 });

    const imgY = (doc as any).y + 28;
    doc.fillColor('#374151').fontSize(12).font('Helvetica-Bold').text('Evidencia fotográfica', 50, imgY);
    doc.moveTo(50, imgY + 16).lineTo(545, imgY + 16).strokeColor('#e5e7eb').lineWidth(0.5).stroke();

    if (fotoPath && fs.existsSync(fotoPath)) {
      try {
        doc.image(fotoPath, 50, imgY + 26, { fit: [495, 320], align: 'center' });
      } catch { doc.fillColor('#9ca3af').fontSize(10).text('No se pudo incrustar la imagen.', 50, imgY + 30); }
    } else {
      doc.fillColor('#9ca3af').fontSize(10).font('Helvetica').text('Sin imagen adjunta.', 50, imgY + 30);
    }

    doc.fillColor('#9ca3af').fontSize(9).font('Helvetica')
      .text(`Generado por AgroSmart · ${new Date().toLocaleString('es-CO')}`, 50, doc.page.height - 50, { align: 'center', width: 495 });

    doc.end();
  });
}
}