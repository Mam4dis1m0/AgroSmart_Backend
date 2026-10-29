import { ForbiddenException } from '@nestjs/common';
import { TareaSugerenciasService } from './tarea-sugerencias.service';

const admin: any = { idusuario: 1, rol: 'admin', idfinca: 1, email: '' };
const empleado: any = { idusuario: 5, rol: 'empleado', idfinca: 1, email: '' };

/** ds.query responde según el texto del SQL; cada clave es un fragmento que lo identifica. */
function dsCon(respuestas: Record<string, any[] | ((p: any[]) => any[])>) {
  const query = jest.fn(async (sql: string, params: any[] = []) => {
    for (const [fragmento, r] of Object.entries(respuestas)) {
      if (sql.includes(fragmento))
        return typeof r === 'function' ? r(params) : r;
    }
    return [];
  });
  return { ds: { query } as any, query };
}

const tarea = (o = {}) => ({
  tipoactividad: 'Fertilización',
  idplantilla: 7,
  horasestimadas: 4,
  costototal: 20000,
  hectareas: null,
  ...o,
});

describe('TareaSugerenciasService.insumosSugeridos (por hectárea)', () => {
  it('escala la cantidad de la plantilla y del historial por las hectáreas del lote', async () => {
    const { ds } = dsCon({
      'FROM tarea t': [tarea({ hectareas: 2.5 })],
      'FROM detalle_tarea WHERE idtarea': [],
      'AVG(d.cantidadusada)': [
        {
          idinsumo: 11,
          nombre: 'Urea',
          unidadmedida: 'kg',
          stockactual: 90,
          cantidad: 30,
          porhectarea: 10,
        },
      ],
      'FROM plantilla_labor_insumo': [
        {
          idinsumo: null,
          tipoinsumo: 'Fertilizante',
          unidad: 'kg',
          cantidadsugerida: null,
        },
      ],
      'tipo ILIKE': [
        { idinsumo: 11, nombre: 'Urea', unidadmedida: 'kg', stockactual: 90 },
      ],
    });

    const r = await new TareaSugerenciasService(ds).insumosSugeridos(
      1,
      3,
      admin,
    );

    expect(r[0]).toMatchObject({ idinsumo: 11, cantidad: 25, hectareas: 2.5 }); // 10 kg/ha × 2,5 ha
  });

  it('la cantidad de una plantilla (por hectárea) se multiplica por las hectáreas', async () => {
    const { ds } = dsCon({
      'FROM tarea t': [tarea({ hectareas: 4 })],
      'FROM plantilla_labor_insumo': [
        {
          idinsumo: 11,
          tipoinsumo: null,
          unidad: 'kg',
          cantidadsugerida: 12.5,
        },
      ],
      'FROM insumo WHERE idinsumo': [
        { idinsumo: 11, nombre: 'Urea', unidadmedida: 'kg', stockactual: 90 },
      ],
    });

    const r = await new TareaSugerenciasService(ds).insumosSugeridos(
      1,
      3,
      admin,
    );

    expect(r[0].cantidad).toBe(50);
  });

  it('si el lote no tiene área registrada no escala y usa el promedio simple del historial', async () => {
    const { ds } = dsCon({
      'FROM tarea t': [tarea({ hectareas: null, idplantilla: null })],
      'AVG(d.cantidadusada)': [
        {
          idinsumo: 12,
          nombre: 'Foliar',
          unidadmedida: 'L',
          stockactual: 9,
          cantidad: 2.345,
          porhectarea: 1.1,
        },
      ],
    });

    const r = await new TareaSugerenciasService(ds).insumosSugeridos(
      1,
      3,
      admin,
    );

    expect(r[0]).toMatchObject({ cantidad: 2.35, hectareas: null });
  });
});

describe('TareaSugerenciasService.insumosSugeridos', () => {
  it('propone el insumo de la finca que coincide con el tipo de la plantilla y la cantidad histórica', async () => {
    const { ds } = dsCon({
      'FROM tarea t': [tarea()],
      'FROM detalle_tarea WHERE idtarea': [],
      'AVG(d.cantidadusada)': [
        {
          idinsumo: 11,
          nombre: 'Urea',
          unidadmedida: 'kg',
          stockactual: 40,
          cantidad: 12.5,
        },
      ],
      'FROM plantilla_labor_insumo': [
        {
          idinsumo: null,
          tipoinsumo: 'Fertilizante',
          unidad: 'kg',
          cantidadsugerida: null,
        },
      ],
      'tipo ILIKE': [
        {
          idinsumo: 10,
          nombre: 'Compost',
          unidadmedida: 'kg',
          stockactual: 100,
        },
        { idinsumo: 11, nombre: 'Urea', unidadmedida: 'kg', stockactual: 40 },
      ],
    });

    const r = await new TareaSugerenciasService(ds).insumosSugeridos(
      1,
      3,
      admin,
    );

    // Entre los candidatos se prefiere el que ya se usó antes en esta labor
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      idinsumo: 11,
      nombre: 'Urea',
      cantidad: 12.5,
      origen: 'plantilla',
    });
    expect(r[0].candidatos).toHaveLength(2);
  });

  it('sin plantilla usa el historial de la labor y no repite lo ya registrado en la tarea', async () => {
    const { ds } = dsCon({
      'FROM tarea t': [tarea({ idplantilla: null })],
      'FROM detalle_tarea WHERE idtarea': [{ idinsumo: 11 }],
      'AVG(d.cantidadusada)': [
        {
          idinsumo: 11,
          nombre: 'Urea',
          unidadmedida: 'kg',
          stockactual: 40,
          cantidad: 12,
        },
        {
          idinsumo: 12,
          nombre: 'Foliar',
          unidadmedida: 'L',
          stockactual: 9,
          cantidad: 2.345,
        },
      ],
    });

    const r = await new TareaSugerenciasService(ds).insumosSugeridos(
      1,
      3,
      admin,
    );

    expect(r.map((i) => i.idinsumo)).toEqual([12]);
    expect(r[0]).toMatchObject({ origen: 'historial', cantidad: 2.35 });
  });

  it('si la finca no tiene insumos de ese tipo igual muestra el tipo para que elija uno', async () => {
    const { ds } = dsCon({
      'FROM tarea t': [tarea()],
      'FROM plantilla_labor_insumo': [
        {
          idinsumo: null,
          tipoinsumo: 'Herbicida',
          unidad: 'L',
          cantidadsugerida: null,
        },
      ],
    });

    const r = await new TareaSugerenciasService(ds).insumosSugeridos(
      1,
      3,
      admin,
    );

    expect(r[0]).toMatchObject({
      idinsumo: null,
      nombre: 'Herbicida',
      unidad: 'L',
      candidatos: [],
    });
  });

  it('un empleado no ve sugerencias de tareas que no le asignaron', async () => {
    const { ds } = dsCon({
      'FROM tarea t': [tarea()],
      'FROM asignacion_tarea WHERE idtarea': [],
    });

    await expect(
      new TareaSugerenciasService(ds).insumosSugeridos(1, 3, empleado),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('TareaSugerenciasService.costos', () => {
  it('la mano de obra es el tiempo trabajado × el costo por hora de la finca', async () => {
    const { ds } = dsCon({
      'AS insumos': [
        { insumos: 30000.5, horas: 5, personas: 2, transporte: 5000 },
      ], // primero: su SQL también contiene "FROM tarea WHERE idtarea"
      'FROM finca WHERE idfinca': [
        { inicio: '07:00:00', fin: '16:00:00', descanso: 60, personas: null },
      ],
      'FROM empleado e': [
        { tipopago: 'dia', valorpago: 80000 },
        { tipopago: 'dia', valorpago: 80000 },
      ],
      'FROM tarea t': [tarea({ costototal: 50000 })],
    });

    const r = await new TareaSugerenciasService(ds).costos(1, 3, admin);

    // 80.000 por día ÷ 8 h = 10.000 por hora → 5 h-persona = 50.000
    expect(r).toEqual({
      estimado: 50000,
      insumos: 30000.5,
      manoObra: 50000,
      horas: 5,
      personas: 2,
      costoHora: 10000,
      transporte: 5000,
      total: 85000.5,
    });
  });

  it('sin pago configurado en los empleados la mano de obra queda en cero (no inventa tarifas)', async () => {
    const { ds } = dsCon({
      'AS insumos': [{ insumos: 1000, horas: 4, personas: 1, transporte: 0 }],
      'FROM finca WHERE idfinca': [
        { inicio: '07:00:00', fin: '16:00:00', descanso: 60, personas: null },
      ],
      'FROM empleado e': [{ tipopago: 'dia', valorpago: 0 }],
      'FROM tarea t': [tarea()],
    });

    const r = await new TareaSugerenciasService(ds).costos(1, 3, admin);

    expect(r.manoObra).toBe(0);
    expect(r.total).toBe(1000);
  });
});
