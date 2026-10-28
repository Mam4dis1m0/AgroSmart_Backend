import { ForbiddenException } from '@nestjs/common';
import { TareaSugerenciasService } from './tarea-sugerencias.service';

const admin: any = { idusuario: 1, rol: 'admin', idfinca: 1, email: '' };
const empleado: any = { idusuario: 5, rol: 'empleado', idfinca: 1, email: '' };

/** ds.query responde según el texto del SQL; cada clave es un fragmento que lo identifica. */
function dsCon(respuestas: Record<string, any[] | ((p: any[]) => any[])>) {
  const query = jest.fn(async (sql: string, params: any[] = []) => {
    for (const [fragmento, r] of Object.entries(respuestas)) {
      if (sql.includes(fragmento)) return typeof r === 'function' ? r(params) : r;
    }
    return [];
  });
  return { ds: { query } as any, query };
}

const tarea = (o = {}) => ({ tipoactividad: 'Fertilización', idplantilla: 7, horasestimadas: 4, costototal: 20000, ...o });

describe('TareaSugerenciasService.insumosSugeridos', () => {
  it('propone el insumo de la finca que coincide con el tipo de la plantilla y la cantidad histórica', async () => {
    const { ds } = dsCon({
      'FROM tarea WHERE idtarea': [tarea()],
      'FROM detalle_tarea WHERE idtarea': [],
      'AVG(d.cantidadusada)': [{ idinsumo: 11, nombre: 'Urea', unidadmedida: 'kg', stockactual: 40, cantidad: 12.5 }],
      'FROM plantilla_labor_insumo': [{ idinsumo: null, tipoinsumo: 'Fertilizante', unidad: 'kg', cantidadsugerida: null }],
      'tipo ILIKE': [
        { idinsumo: 10, nombre: 'Compost', unidadmedida: 'kg', stockactual: 100 },
        { idinsumo: 11, nombre: 'Urea', unidadmedida: 'kg', stockactual: 40 },
      ],
    });

    const r = await new TareaSugerenciasService(ds).insumosSugeridos(1, 3, admin);

    // Entre los candidatos se prefiere el que ya se usó antes en esta labor
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ idinsumo: 11, nombre: 'Urea', cantidad: 12.5, origen: 'plantilla' });
    expect(r[0].candidatos).toHaveLength(2);
  });

  it('sin plantilla usa el historial de la labor y no repite lo ya registrado en la tarea', async () => {
    const { ds } = dsCon({
      'FROM tarea WHERE idtarea': [tarea({ idplantilla: null })],
      'FROM detalle_tarea WHERE idtarea': [{ idinsumo: 11 }],
      'AVG(d.cantidadusada)': [
        { idinsumo: 11, nombre: 'Urea', unidadmedida: 'kg', stockactual: 40, cantidad: 12 },
        { idinsumo: 12, nombre: 'Foliar', unidadmedida: 'L', stockactual: 9, cantidad: 2.345 },
      ],
    });

    const r = await new TareaSugerenciasService(ds).insumosSugeridos(1, 3, admin);

    expect(r.map((i) => i.idinsumo)).toEqual([12]);
    expect(r[0]).toMatchObject({ origen: 'historial', cantidad: 2.35 });
  });

  it('si la finca no tiene insumos de ese tipo igual muestra el tipo para que elija uno', async () => {
    const { ds } = dsCon({
      'FROM tarea WHERE idtarea': [tarea()],
      'FROM plantilla_labor_insumo': [{ idinsumo: null, tipoinsumo: 'Herbicida', unidad: 'L', cantidadsugerida: null }],
    });

    const r = await new TareaSugerenciasService(ds).insumosSugeridos(1, 3, admin);

    expect(r[0]).toMatchObject({ idinsumo: null, nombre: 'Herbicida', unidad: 'L', candidatos: [] });
  });

  it('un empleado no ve sugerencias de tareas que no le asignaron', async () => {
    const { ds } = dsCon({ 'FROM tarea WHERE idtarea': [tarea()], 'FROM asignacion_tarea WHERE idtarea': [] });

    await expect(new TareaSugerenciasService(ds).insumosSugeridos(1, 3, empleado)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('TareaSugerenciasService.pagoSugerido', () => {
  it('labor por tiempo: horas estimadas × tarifa del empleado', async () => {
    const { ds } = dsCon({
      'FROM tarea WHERE idtarea': [tarea({ horasestimadas: 4 })],
      'AS modalidad': [{ modalidad: 'tiempo' }],
      'FROM empleado': [{ hora: 6000, jornal: 0 }],
    });

    const r = await new TareaSugerenciasService(ds).pagoSugerido(1, 3, 5, admin);

    expect(r).toMatchObject({ modalidad: 'tiempo', sugerido: 24000, base: 'tarifa' });
  });

  it('sin tarifa por hora usa el jornal dividido en 8 horas', async () => {
    const { ds } = dsCon({
      'FROM tarea WHERE idtarea': [tarea({ horasestimadas: 8 })],
      'AS modalidad': [{ modalidad: 'tiempo' }],
      'FROM empleado': [{ hora: 0, jornal: 80000 }],
    });

    expect((await new TareaSugerenciasService(ds).pagoSugerido(1, 3, 5, admin)).sugerido).toBe(80000);
  });

  it('labor a destajo: promedio de lo pagado antes en la misma labor', async () => {
    const { ds } = dsCon({
      'FROM tarea WHERE idtarea': [tarea({ tipoactividad: 'Cosecha' })],
      'AS modalidad': [{ modalidad: 'fijo' }],
      'AVG(a.pagoacordado)': [{ promedio: 148333.4, muestras: 3 }],
    });

    const r = await new TareaSugerenciasService(ds).pagoSugerido(1, 3, 5, admin);

    expect(r).toMatchObject({ modalidad: 'fijo', sugerido: 148333, base: 'historico', muestras: 3 });
  });

  it('destajo sin historial cae a la tarifa del empleado; sin nada devuelve null', async () => {
    const conTarifa = dsCon({
      'FROM tarea WHERE idtarea': [tarea({ horasestimadas: 10 })],
      'AS modalidad': [{ modalidad: 'fijo' }],
      'AVG(a.pagoacordado)': [{ promedio: null, muestras: 0 }],
      'FROM empleado': [{ hora: 5000, jornal: 0 }],
    });
    expect((await new TareaSugerenciasService(conTarifa.ds).pagoSugerido(1, 3, 5, admin)).sugerido).toBe(50000);

    const sinDatos = dsCon({
      'FROM tarea WHERE idtarea': [tarea({ horasestimadas: null })],
      'AS modalidad': [{ modalidad: 'tiempo' }],
      'FROM empleado': [{ hora: 0, jornal: 0 }],
    });
    expect(await new TareaSugerenciasService(sinDatos.ds).pagoSugerido(1, 3, 5, admin)).toMatchObject({ sugerido: null, base: null });
  });
});

describe('TareaSugerenciasService.costos', () => {
  it('suma insumos, mano de obra y transporte y muestra el estimado aparte', async () => {
    const { ds } = dsCon({
      'AS insumos': [{ insumos: 30000.5, mano: 45000, transporte: 5000 }], // primero: su SQL también contiene "FROM tarea WHERE idtarea"
      'FROM tarea WHERE idtarea': [tarea({ costototal: 50000 })],
    });

    const r = await new TareaSugerenciasService(ds).costos(1, 3, admin);

    expect(r).toEqual({ estimado: 50000, insumos: 30000.5, manoObra: 45000, transporte: 5000, total: 80000.5 });
  });
});
