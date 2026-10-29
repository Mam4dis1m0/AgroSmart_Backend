import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { PlantillaLabor } from '../../Entidades/entities/PlantillaLabor';
import { PlantillaLaborInsumo } from '../../Entidades/entities/PlantillaLaborInsumo';
import { Cultivo } from '../../Entidades/entities/Cultivo';
import { Tarea } from '../../Entidades/entities/Tarea';
import { TenantContext } from '../../auth/tenant-context';
import { filas } from '../../common/sql';
import { CATEGORIAS, categoriaDeTipo, esCategoria } from './categorias';
import { hoy, primeraFecha } from './fechas';
import { costoHoraDeFinca } from '../tareas/mano-obra';
import { CreatePlantillaDto, UpdatePlantillaDto } from '../../dto/plantilla.dto';
import { AsignacionSugeridaService } from '../tareas/asignacion-sugerida.service';

export interface ItemPlan {
  idplantilla: number;
  actividad: string;
  etapa: string | null;
  fecha: string | null;
  horasestimadas: number | null;
  numpersonas: number;
  prioridad: string;
  esrecurrente: boolean;
  frecuenciadias: number | null;
  modalidadpago: string;
  costoestimado: number;
  insumos: { tipoinsumo: string | null; unidad: string | null }[];
  /** Hectáreas del lote del cultivo; las horas y cantidades de la plantilla (por hectárea) se multiplican por ellas. */
  hectareas: number | null;
  /** Horas de la plantilla para 1 hectárea, antes de escalar. */
  horasPorHectarea: number | null;
  /** La fecha original ya había pasado y se corrió a la próxima repetición (cultivo ya establecido). */
  ajustada: boolean;
  /** La fecha ya pasó (cultivo sembrado antes): se muestra pero no se marca por defecto. */
  pasada: boolean;
  /** Ya existe una tarea de esta plantilla para este cultivo. */
  yaCreada: boolean;
  /** Motivo por el que no se puede programar (el cultivo no tiene la fecha base). */
  omitida: string | null;
}

@Injectable()
export class PlantillasService {
  constructor(
    @InjectRepository(PlantillaLabor) private repo: Repository<PlantillaLabor>,
    @InjectRepository(PlantillaLaborInsumo) private insumoRepo: Repository<PlantillaLaborInsumo>,
    @InjectRepository(Cultivo) private cultivoRepo: Repository<Cultivo>,
    @InjectRepository(Tarea) private tareaRepo: Repository<Tarea>,
    private readonly sugerida: AsignacionSugeridaService,
  ) {}

  private get idfinca(): number {
    return TenantContext.requireFinca();
  }

  categorias() {
    return CATEGORIAS;
  }

  // ── Consulta ──────────────────────────────────────────────────────────────

  /** Plantillas propias de la finca (copias editables), con sus insumos. */
  async listar(categoria?: string) {
    const where: any = { idfinca: this.idfinca };
    if (categoria) where.categoria = categoria;
    const plantillas = await this.repo.find({ where, order: { categoria: 'ASC', diasoffset: 'ASC', idplantilla: 'ASC' } });
    return this.conInsumos(plantillas);
  }

  /** Catálogo base de AgroSmart (solo lectura). */
  async catalogo(categoria?: string) {
    const where: any = { idfinca: IsNull() };
    if (categoria) where.categoria = categoria;
    const plantillas = await this.repo.find({ where, order: { categoria: 'ASC', diasoffset: 'ASC', idplantilla: 'ASC' } });
    return this.conInsumos(plantillas);
  }

  private async conInsumos(plantillas: PlantillaLabor[]) {
    if (!plantillas.length) return [];
    const ids = plantillas.map((p) => p.idplantilla);
    const ins = await this.insumoRepo
      .createQueryBuilder('i')
      .where('i.idplantilla IN (:...ids)', { ids })
      .getMany();
    return plantillas.map((p) => ({ ...p, insumos: ins.filter((i) => i.idplantilla === p.idplantilla) }));
  }

  // ── Adopción del catálogo base ────────────────────────────────────────────

  /**
   * La finca obtiene su propia copia (editable) del catálogo base de una categoría.
   * Idempotente: si ya tiene plantillas de esa categoría no vuelve a copiar.
   */
  async adoptar(categoria: string) {
    if (!esCategoria(categoria)) throw new BadRequestException('Categoría desconocida');
    await this.repo.manager.transaction((m) => this.copiarBase(m, categoria));
    return this.listar(categoria);
  }

  private async copiarBase(m: EntityManager, categoria: string): Promise<void> {
    const idfinca = this.idfinca;
    const yaTiene = await m.count(PlantillaLabor, { where: { idfinca, categoria } });
    if (yaTiene) return;

    const base = await m.find(PlantillaLabor, { where: { idfinca: IsNull(), categoria, activa: true } });
    for (const b of base) {
      const { idplantilla, idfinca: _f, idplantillabase: _b, ...datos } = b;
      const copia = await m.save(PlantillaLabor, m.create(PlantillaLabor, { ...datos, idfinca, idplantillabase: idplantilla }));
      const insumos = await m.find(PlantillaLaborInsumo, { where: { idplantilla } });
      for (const i of insumos) {
        const { idplantillainsumo, idplantilla: _p, ...resto } = i;
        await m.save(PlantillaLaborInsumo, m.create(PlantillaLaborInsumo, { ...resto, idplantilla: copia.idplantilla }));
      }
    }
  }

  // ── Edición (solo plantillas de la finca) ─────────────────────────────────

  async crear(dto: CreatePlantillaDto) {
    if (!esCategoria(dto.categoria)) throw new BadRequestException('Categoría desconocida');
    const { insumos, ...datos } = dto;
    const saved = await this.repo.save(this.repo.create({ ...datos, idfinca: this.idfinca }));
    await this.guardarInsumos(saved.idplantilla, insumos);
    return (await this.conInsumos([saved]))[0];
  }

  async actualizar(id: number, dto: UpdatePlantillaDto) {
    const p = await this.repo.findOneBy({ idplantilla: id, idfinca: this.idfinca });
    if (!p) throw new NotFoundException(`Plantilla #${id} no encontrada en esta finca`);
    const { insumos, categoria, ...datos } = dto;
    if (categoria !== undefined && !esCategoria(categoria)) throw new BadRequestException('Categoría desconocida');
    Object.assign(p, datos, categoria !== undefined ? { categoria } : {});
    const saved = await this.repo.save(p);
    if (insumos) await this.guardarInsumos(id, insumos);
    return (await this.conInsumos([saved]))[0];
  }

  /**
   * Agrega o actualiza (por insumo concreto o por tipo) los insumos sugeridos de la plantilla.
   * No borra filas: para dejar de sugerir un insumo se pone su cantidad en 0 o se desactiva la plantilla.
   */
  private async guardarInsumos(idplantilla: number, insumos?: CreatePlantillaDto['insumos']) {
    if (!insumos) return;
    const actuales = await this.insumoRepo.find({ where: { idplantilla } });
    for (const i of insumos) {
      const igual = actuales.find((a) =>
        i.idinsumo ? a.idinsumo === i.idinsumo : !a.idinsumo && a.tipoinsumo === (i.tipoinsumo ?? null),
      );
      if (igual) {
        Object.assign(igual, i);
        await this.insumoRepo.save(igual);
      } else {
        await this.insumoRepo.save(this.insumoRepo.create({ ...i, idplantilla }));
      }
    }
  }

  // ── Plan de labores de un cultivo ─────────────────────────────────────────

  private async cultivoDeFinca(idcultivo: number): Promise<Cultivo> {
    const c = await this.cultivoRepo.findOneBy({ idcultivo, idfinca: this.idfinca });
    if (!c) throw new NotFoundException('El cultivo no existe en esta finca');
    return c;
  }

  private categoriaDe(c: Cultivo): string {
    const cat = c.categoria ?? categoriaDeTipo(c.tipo);
    if (!cat) {
      throw new BadRequestException(
        'No se pudo deducir la categoría de este cultivo. Edítalo y elige una categoría de manejo.',
      );
    }
    return cat;
  }

  /** Hectáreas del lote del cultivo (null si no tiene lote o el lote no tiene área registrada). */
  private async hectareasDe(idcultivo: number): Promise<number | null> {
    const [r] = filas<{ ha: number | null }>(
      await this.repo.manager.query(
        `SELECT l.areahectareas::float8 AS ha
           FROM cultivo c LEFT JOIN lote l ON l.idlote = c.idlote
          WHERE c.idcultivo = $1 AND c.idfinca = $2`,
        [idcultivo, this.idfinca],
      ),
    );
    return r?.ha && r.ha > 0 ? r.ha : null;
  }

  /** Costo de los insumos concretos de la plantilla (los que son solo un tipo no se pueden valorar aún). */
  private async costoInsumos(ids: number[]): Promise<Map<number, number>> {
    if (!ids.length) return new Map();
    const rows = filas<{ idplantilla: number; costo: number }>(
      await this.repo.manager.query(
        `SELECT pi.idplantilla, SUM(COALESCE(pi.cantidadsugerida, 0) * COALESCE(i.costounitario, 0))::float8 AS costo
           FROM plantilla_labor_insumo pi
           JOIN insumo i ON i.idinsumo = pi.idinsumo AND i.idfinca = $2
          WHERE pi.idplantilla = ANY($1)
          GROUP BY pi.idplantilla`,
        [ids, this.idfinca],
      ),
    );
    return new Map(rows.map((r) => [r.idplantilla, r.costo]));
  }

  /**
   * Horas y costo de una labor para ESTE cultivo. Las plantillas están expresadas para 1 hectárea:
   * se multiplican por las hectáreas del lote. Mano de obra = horas × personas × costo por hora de la finca.
   */
  private estimar(p: PlantillaLabor, ha: number | null, costoHora: number, costoInsumo1ha: number) {
    const factor = ha ?? 1;
    const horas = p.horasestimadas === null ? null : Math.round(p.horasestimadas * factor * 100) / 100;
    const costo = Math.round(((horas ?? 0) * p.numpersonas * costoHora + costoInsumo1ha * factor) * 100) / 100;
    return { horas, costo };
  }

  /** Vista previa: qué tareas se crearían, sin crear nada. */
  async vistaPrevia(idcultivo: number): Promise<{ categoria: string; desdeBase: boolean; hectareas: number | null; items: ItemPlan[] }> {
    const cultivo = await this.cultivoDeFinca(idcultivo);
    const categoria = this.categoriaDe(cultivo);

    let plantillas = await this.repo.find({ where: { idfinca: this.idfinca, categoria, activa: true } });
    const desdeBase = plantillas.length === 0;
    if (desdeBase) plantillas = await this.repo.find({ where: { idfinca: IsNull(), categoria, activa: true } });
    plantillas = plantillas.filter((p) => !p.tipocultivo || p.tipocultivo.toLowerCase() === (cultivo.tipo ?? '').toLowerCase());
    plantillas.sort((a, b) => a.diasoffset - b.diasoffset || a.idplantilla - b.idplantilla);

    const ids = plantillas.map((p) => p.idplantilla);
    const [conInsumos, costoHora, costos, existentes, ha] = await Promise.all([
      this.conInsumos(plantillas),
      costoHoraDeFinca((q, par) => this.repo.manager.query(q, par), this.idfinca),
      this.costoInsumos(ids),
      this.plantillasYaCreadas(idcultivo),
      this.hectareasDe(idcultivo),
    ]);

    const hoyISO = hoy();
    const items: ItemPlan[] = conInsumos.map((p) => {
      const f = primeraFecha(p, cultivo, hoyISO);
      const { horas, costo } = this.estimar(p, ha, costoHora, costos.get(p.idplantilla) ?? 0);
      const ref = desdeBase ? p.idplantilla : p.idplantillabase ?? p.idplantilla;
      return {
        idplantilla: p.idplantilla,
        actividad: p.actividad,
        etapa: p.etapa,
        fecha: f.fecha,
        horasestimadas: horas,
        horasPorHectarea: p.horasestimadas,
        hectareas: ha,
        numpersonas: p.numpersonas,
        prioridad: p.prioridad,
        esrecurrente: p.esrecurrente,
        frecuenciadias: p.frecuenciadias,
        modalidadpago: p.modalidadpago,
        costoestimado: costo,
        insumos: p.insumos.map((i) => ({ tipoinsumo: i.tipoinsumo, unidad: i.unidad })),
        pasada: f.pasada,
        ajustada: f.ajustada,
        yaCreada: existentes.has(p.idplantilla) || existentes.has(ref),
        omitida: f.terminada
          ? 'Esta labor ya cumplió su ciclo'
          : f.fecha
            ? null
            : `El cultivo no tiene fecha de ${p.base === 'cosecha_estimada' ? 'cosecha estimada' : 'siembra'}`,
      };
    });
    return { categoria, desdeBase, hectareas: ha, items };
  }

  /** Plantillas (de la finca o su base) de las que este cultivo ya tiene tareas. */
  private async plantillasYaCreadas(idcultivo: number): Promise<Set<number>> {
    const rows = filas<{ idplantilla: number; idplantillabase: number | null }>(
      await this.repo.manager.query(
        `SELECT DISTINCT t.idplantilla, p.idplantillabase
           FROM tarea t LEFT JOIN plantilla_labor p ON p.idplantilla = t.idplantilla
          WHERE t.idfinca = $1 AND t.idcultivo = $2 AND t.idplantilla IS NOT NULL`,
        [this.idfinca, idcultivo],
      ),
    );
    const s = new Set<number>();
    rows.forEach((r) => { s.add(r.idplantilla); if (r.idplantillabase) s.add(r.idplantillabase); });
    return s;
  }

  /**
   * Crea las tareas del plan. `ids` = plantillas elegidas en la vista previa (si no se envía,
   * todas las que tienen fecha y no están vencidas). No duplica labores que el cultivo ya tiene.
   */
  async generarPlan(idcultivo: number, ids?: number[]) {
    const cultivo = await this.cultivoDeFinca(idcultivo);
    const categoria = this.categoriaDe(cultivo);
    const idfinca = this.idfinca;
    const admin = TenantContext.requireUser().idusuario;
    const hoyISO = hoy();

    const [costoHora, ha] = await Promise.all([
      costoHoraDeFinca((q, par) => this.repo.manager.query(q, par), idfinca),
      this.hectareasDe(idcultivo),
    ]);

    const resultado = await this.repo.manager.transaction(async (m) => {
      await this.copiarBase(m, categoria); // la finca pasa a trabajar con su copia
      const propias = await m.find(PlantillaLabor, { where: { idfinca, categoria, activa: true } });
      const elegidasPorElCliente = ids?.length ? new Set(ids) : null;

      const costos = await this.costoInsumos(propias.map((p) => p.idplantilla));
      const hechas = await this.plantillasYaCreadas(idcultivo);
      const creadas: Tarea[] = [];
      let omitidas = 0;

      for (const p of propias) {
        if (p.tipocultivo && p.tipocultivo.toLowerCase() !== (cultivo.tipo ?? '').toLowerCase()) continue;
        const yaExiste = hechas.has(p.idplantilla) || (p.idplantillabase !== null && hechas.has(p.idplantillabase));
        const f = primeraFecha(p, cultivo, hoyISO);

        // El cliente pudo elegir la plantilla base o la copia de la finca
        const elegida = elegidasPorElCliente
          ? elegidasPorElCliente.has(p.idplantilla) || (p.idplantillabase !== null && elegidasPorElCliente.has(p.idplantillabase))
          : !f.pasada;
        if (!elegida) continue;
        if (yaExiste || !f.fecha) { omitidas++; continue; }

        const { horas, costo } = this.estimar(p, ha, costoHora, costos.get(p.idplantilla) ?? 0);
        creadas.push(
          await m.save(
            Tarea,
            m.create(Tarea, {
              idfinca,
              tipoactividad: p.actividad,
              fechaprogramada: f.fecha,
              estado: 'Pendiente',
              esrecurrente: p.esrecurrente ? 'Sí' : 'No',
              frecuenciadias: p.esrecurrente ? p.frecuenciadias : null,
              prioridad: p.prioridad,
              horasestimadas: horas,
              etapa: p.etapa,
              idplantilla: p.idplantilla,
              generadaauto: true,
              costototal: costo,
              idcultivo: { idcultivo } as any,
              idadmincreador: { idusuario: admin } as any,
            }),
          ),
        );
      }
      return { creadas: creadas.length, omitidas, tareas: creadas.map((t) => ({ idtarea: t.idtarea, tipoactividad: t.tipoactividad, fechaprogramada: t.fechaprogramada })) };
    });

    // Modo automático: las tareas nacen ya asignadas (fuera de la transacción: no debe impedir crear el plan)
    let asignadas = 0;
    if (resultado.tareas.length && (await this.sugerida.modoAsignacion(idfinca)) === 'automatica') {
      for (const t of resultado.tareas) {
        try {
          if (await this.sugerida.asignarAutomatico(idfinca, t.idtarea, admin)) asignadas++;
        } catch { /* queda sin asignar; el admin la ve pendiente */ }
      }
    }
    return { ...resultado, asignadas };
  }
}
