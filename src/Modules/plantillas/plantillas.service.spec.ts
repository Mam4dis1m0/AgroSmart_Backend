import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PlantillasService } from './plantillas.service';
import { PlantillaLabor } from '../../Entidades/entities/PlantillaLabor';
import { PlantillaLaborInsumo } from '../../Entidades/entities/PlantillaLaborInsumo';
import { Cultivo } from '../../Entidades/entities/Cultivo';
import { Tarea } from '../../Entidades/entities/Tarea';
import { createMockRepository, conSesion, sesionAdmin } from '../../test/mocks/common-providers.mock';
import { sumarDias, hoy } from './fechas';
import { AsignacionSugeridaService } from '../tareas/asignacion-sugerida.service';

describe('PlantillasService.vistaPrevia', () => {
  let service: PlantillasService;
  const plantillaRepo: any = createMockRepository();
  const insumoRepo: any = createMockRepository();
  const cultivoRepo: any = createMockRepository();
  const tareaRepo: any = createMockRepository();
  const query = jest.fn();

  const base = (o: Partial<PlantillaLabor>): PlantillaLabor => ({
    idplantilla: 1, idfinca: null, idplantillabase: null, categoria: 'ciclo_corto', tipocultivo: null,
    actividad: 'Siembra', etapa: null, base: 'siembra', diasoffset: 0, esrecurrente: false,
    frecuenciadias: null, diasfin: null, horasestimadas: 8, numpersonas: 2, personasporhectarea: 2, prioridad: 'Alta',
    modalidadpago: 'tiempo', activa: true, ...o,
  });

  beforeEach(async () => {
    plantillaRepo.manager = { query };
    insumoRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    }));
    const mod = await Test.createTestingModule({
      providers: [
        PlantillasService,
        { provide: getRepositoryToken(PlantillaLabor), useValue: plantillaRepo },
        { provide: getRepositoryToken(PlantillaLaborInsumo), useValue: insumoRepo },
        { provide: getRepositoryToken(Cultivo), useValue: cultivoRepo },
        { provide: getRepositoryToken(Tarea), useValue: tareaRepo },
        { provide: AsignacionSugeridaService, useValue: { modoAsignacion: jest.fn(), asignarAutomatico: jest.fn() } },
      ],
    }).compile();
    service = mod.get(PlantillasService);
  });

  afterEach(() => { jest.resetAllMocks(); });

  /** Respuestas de las consultas SQL: jornada y pago de los empleados, hectáreas, costo de insumos y plantillas ya creadas. */
  const sql = (pagoDia: number, yaCreadas: any[] = [], hectareas: number | null = null) =>
    query.mockImplementation(async (texto: string) => {
      if (texto.includes('FROM finca WHERE')) return [{ inicio: '07:00:00', fin: '16:00:00', descanso: 60, personas: null }];
      if (texto.includes('FROM empleado e')) return pagoDia > 0 ? [{ tipopago: 'dia', valorpago: pagoDia }] : [];
      if (texto.includes('LEFT JOIN lote')) return [{ ha: hectareas }];
      if (texto.includes('plantilla_labor_insumo')) return [];
      return yaCreadas;
    });

  it('programa las labores desde la siembra y estima la mano de obra con el costo por hora de la finca', async () => {
    const siembra = sumarDias(hoy(), 10);
    cultivoRepo.findOneBy.mockResolvedValue({ idcultivo: 3, tipo: 'Maíz', categoria: null, fechasiembra: siembra, fechacosechaestimada: null });
    plantillaRepo.find
      .mockResolvedValueOnce([]) // la finca aún no tiene copia
      .mockResolvedValueOnce([
        base({ idplantilla: 1, actividad: 'Preparación del suelo', diasoffset: -7, horasestimadas: 8, numpersonas: 2 }),
        base({ idplantilla: 2, actividad: 'Cosecha', base: 'cosecha_estimada' }),
      ]);
    sql(40000); // un empleado a 40.000 por día ÷ 8 h = 5.000 por hora

    const r = await conSesion(sesionAdmin, () => service.vistaPrevia(3));

    expect(r.categoria).toBe('ciclo_corto');
    expect(r.desdeBase).toBe(true);
    const prep = r.items.find((i) => i.actividad === 'Preparación del suelo')!;
    expect(prep.fecha).toBe(sumarDias(siembra, -7));
    expect(prep.costoestimado).toBe(80000); // 8 h × 2 personas × 5.000 por hora
    expect(prep.pasada).toBe(false);
    expect(prep.omitida).toBeNull();
    // Sin fecha de cosecha estimada no se puede programar la cosecha
    expect(r.items.find((i) => i.actividad === 'Cosecha')!.omitida).toMatch(/cosecha estimada/);
  });

  it('marca como pasadas las labores de un cultivo ya sembrado y como creadas las que ya existen', async () => {
    cultivoRepo.findOneBy.mockResolvedValue({ idcultivo: 4, tipo: 'Palma', categoria: null, fechasiembra: '2019-03-15', fechacosechaestimada: null });
    plantillaRepo.find
      .mockResolvedValueOnce([base({ idplantilla: 20, idfinca: 1, idplantillabase: 5, categoria: 'palma', actividad: 'Fertilización' })])
      .mockResolvedValueOnce([]);
    sql(0, [{ idplantilla: 20, idplantillabase: 5 }]);

    const r = await conSesion(sesionAdmin, () => service.vistaPrevia(4));

    expect(r.categoria).toBe('palma');
    expect(r.desdeBase).toBe(false);
    expect(r.items[0].pasada).toBe(true);
    expect(r.items[0].yaCreada).toBe(true);
  });

  it('sugiere más personas cuando el lote es más grande, pero las horas para terminar no cambian', async () => {
    cultivoRepo.findOneBy.mockResolvedValue({ idcultivo: 3, tipo: 'Maíz', categoria: null, fechasiembra: sumarDias(hoy(), 10), fechacosechaestimada: null });
    plantillaRepo.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([base({ idplantilla: 1, actividad: 'Fertilización', diasoffset: 0, horasestimadas: 4, personasporhectarea: 1 })]);
    sql(40000, [], 2.5);

    const r = await conSesion(sesionAdmin, () => service.vistaPrevia(3));

    expect(r.hectareas).toBe(2.5);
    // 1 persona por hectárea × 2,5 ha = 3 personas (se redondea hacia arriba); siguen siendo 4 h
    expect(r.items[0]).toMatchObject({ personasPorHectarea: 1, numpersonas: 3, horasestimadas: 4, costoestimado: 60000 }); // 3 × 4 h × 5.000
  });

  it('con menos de una persona por hectárea sugiere al menos una', async () => {
    cultivoRepo.findOneBy.mockResolvedValue({ idcultivo: 3, tipo: 'Maíz', categoria: null, fechasiembra: sumarDias(hoy(), 10), fechacosechaestimada: null });
    plantillaRepo.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([base({ idplantilla: 1, actividad: 'Rotación de potreros', diasoffset: 0, horasestimadas: 2, personasporhectarea: 0.2 })]);
    sql(40000, [], 1.5);

    const r = await conSesion(sesionAdmin, () => service.vistaPrevia(3));

    expect(r.items[0].numpersonas).toBe(1); // 0,2 × 1,5 ha = 0,3 → 1 persona
  });

  it('sin área registrada trata el lote como 1 hectárea', async () => {
    cultivoRepo.findOneBy.mockResolvedValue({ idcultivo: 3, tipo: 'Maíz', categoria: null, fechasiembra: sumarDias(hoy(), 10), fechacosechaestimada: null });
    plantillaRepo.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([base({ idplantilla: 1, actividad: 'Siembra', diasoffset: 0, horasestimadas: 8, personasporhectarea: 3 })]);
    sql(40000, [], null);

    const r = await conSesion(sesionAdmin, () => service.vistaPrevia(3));

    expect(r.hectareas).toBeNull();
    expect(r.items[0].numpersonas).toBe(3);
  });

  it('en un cultivo establecido las labores repetitivas se programan desde la próxima repetición, no en el pasado', async () => {
    cultivoRepo.findOneBy.mockResolvedValue({ idcultivo: 4, tipo: 'Palma', categoria: null, fechasiembra: '2019-03-15', fechacosechaestimada: null });
    plantillaRepo.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([base({ idplantilla: 9, categoria: 'palma', actividad: 'Fertilización', base: 'inicio', diasoffset: 15, esrecurrente: true, frecuenciadias: 120, diasfin: 365 })]);
    sql(0);

    const r = await conSesion(sesionAdmin, () => service.vistaPrevia(4));

    expect(r.items[0].fecha).toBe(sumarDias(hoy(), 15));
    expect(r.items[0].pasada).toBe(false);
  });

  it('pide elegir categoría cuando el tipo de cultivo no se reconoce', async () => {
    cultivoRepo.findOneBy.mockResolvedValue({ idcultivo: 9, tipo: 'Quinua', categoria: null });

    await expect(conSesion(sesionAdmin, () => service.vistaPrevia(9))).rejects.toThrow('categoría de manejo');
  });

  it('usa la categoría elegida por el admin aunque el tipo no se reconozca', async () => {
    cultivoRepo.findOneBy.mockResolvedValue({ idcultivo: 9, tipo: 'Quinua', categoria: 'ciclo_corto', fechasiembra: '2026-01-01' });
    plantillaRepo.find.mockResolvedValue([]);
    sql(0);

    const r = await conSesion(sesionAdmin, () => service.vistaPrevia(9));

    expect(r.categoria).toBe('ciclo_corto');
  });

  it('no encuentra cultivos de otra finca', async () => {
    cultivoRepo.findOneBy.mockResolvedValue(null);

    await expect(conSesion(sesionAdmin, () => service.vistaPrevia(77))).rejects.toThrow('no existe en esta finca');
    expect(cultivoRepo.findOneBy).toHaveBeenCalledWith({ idcultivo: 77, idfinca: 1 });
  });
});
