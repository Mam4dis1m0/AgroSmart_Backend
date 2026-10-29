import { armarCosto } from './costos';
import { horasDeJornada, manoObraDeFinca, pagoDiario } from './mano-obra';

describe('pago diario', () => {
  it('lleva el pago por semana o por mes a un valor por día', () => {
    expect(pagoDiario('dia', 60000)).toBe(60000);
    expect(pagoDiario('semana', 360000)).toBe(60000); // 6 días por semana
    expect(pagoDiario('mes', 1560000)).toBe(60000); // 26 días por mes
    expect(pagoDiario(null, 50000)).toBe(50000);
  });
});

describe('horas de la jornada', () => {
  it('descuenta el descanso', () => {
    expect(horasDeJornada('07:00', '16:00', 60)).toBe(8);
    expect(horasDeJornada('06:30', '15:00', 30)).toBe(8);
    expect(horasDeJornada('08:00', '12:00', 0)).toBe(4);
  });

  it('nunca es negativa', () => {
    expect(horasDeJornada('16:00', '07:00', 60)).toBe(0);
    expect(horasDeJornada('07:00', '08:00', 120)).toBe(0);
  });
});

describe('manoObraDeFinca', () => {
  const consultaCon = (finca: any, empleados: any[]) => async (sql: string) =>
    sql.includes('FROM finca') ? [finca] : empleados;
  const finca = {
    inicio: '07:00:00',
    fin: '16:00:00',
    descanso: 60,
    personas: null,
  };

  it('costo por hora = pago diario del equipo ÷ (personas × horas de la jornada)', async () => {
    // Un empleado a 80.000/día y otro a 480.000/semana (= 80.000/día): 2 personas, 8 h → 10.000/h
    const r = await manoObraDeFinca(
      consultaCon(finca, [
        { tipopago: 'dia', valorpago: 80000 },
        { tipopago: 'semana', valorpago: 480000 },
      ]),
      1,
    );

    expect(r).toMatchObject({
      horasJornada: 8,
      personas: 2,
      pagoDiarioPromedio: 80000,
      pagoDiarioEquipo: 160000,
      costoHora: 10000,
    });
  });

  it('el administrador puede indicar cuántas personas trabajan un día normal', async () => {
    const r = await manoObraDeFinca(
      consultaCon({ ...finca, personas: 5 }, [
        { tipopago: 'dia', valorpago: 60000 },
        { tipopago: 'dia', valorpago: 100000 },
      ]),
      1,
    );

    expect(r.personas).toBe(5);
    expect(r.pagoDiarioEquipo).toBe(400000); // 5 × 80.000 promedio
    expect(r.costoHora).toBe(10000);
  });

  it('empleados sin pago configurado no bajan el promedio; se avisa cuántos faltan', async () => {
    const r = await manoObraDeFinca(
      consultaCon(finca, [
        { tipopago: 'dia', valorpago: 80000 },
        { tipopago: 'dia', valorpago: 0 },
      ]),
      1,
    );

    expect(r).toMatchObject({
      empleadosConPago: 1,
      empleadosSinPago: 1,
      pagoDiarioPromedio: 80000,
    });
  });

  it('sin pagos configurados el costo por hora es 0', async () => {
    expect((await manoObraDeFinca(consultaCon(finca, []), 1)).costoHora).toBe(
      0,
    );
  });
});

describe('costo de una tarea', () => {
  it('suma insumos, mano de obra (horas × costo por hora) y transporte', () => {
    const c = armarCosto(
      { insumos: 30000, horas: 6, personas: 3, transporte: 4000 },
      7500,
    );

    expect(c).toMatchObject({ mano: 45000, total: 79000, personas: 3 });
  });

  it('una tarea sin datos cuesta cero', () => {
    expect(armarCosto(undefined, 8000).total).toBe(0);
  });

  it('si un empleado «infla» sus horas solo cambia cómo se reparte el costo, no su sueldo', () => {
    // El sueldo sale del pago acordado; las horas solo entran aquí
    expect(armarCosto({ horas: 4 }, 10000).mano).toBe(40000);
    expect(armarCosto({ horas: 8 }, 10000).mano).toBe(80000);
  });
});
