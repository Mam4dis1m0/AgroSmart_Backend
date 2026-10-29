import { brutoDePago, diasDelPeriodo, mesesDelPeriodo, unidadesDePago } from './pago-periodo';

describe('períodos de nómina', () => {
  it('cuenta los días del período con ambos extremos', () => {
    expect(diasDelPeriodo('2026-10-01', '2026-10-31')).toBe(31);
    expect(diasDelPeriodo('2026-10-26', '2026-10-26')).toBe(1);
  });

  it('un mes calendario completo vale 1, aunque febrero tenga 28 días', () => {
    expect(mesesDelPeriodo('2026-10-01', '2026-10-31')).toBe(1);
    expect(mesesDelPeriodo('2026-02-01', '2026-02-28')).toBe(1);
    expect(mesesDelPeriodo('2026-09-01', '2026-10-31')).toBe(2);
  });

  it('un período parcial se prorratea por días sobre 30', () => {
    expect(mesesDelPeriodo('2026-10-01', '2026-10-15')).toBe(0.5);
    expect(mesesDelPeriodo('2026-10-10', '2026-11-08')).toBe(1);
  });
});

describe('pago por tipo', () => {
  it('por día: días trabajados × valor del día', () => {
    expect(unidadesDePago('dia', '2026-10-01', '2026-10-31', 18)).toBe(18);
    expect(brutoDePago(18, 60000)).toBe(1080000);
  });

  it('por semana: el valor de la semana por las semanas del período, sin importar los días trabajados', () => {
    expect(unidadesDePago('semana', '2026-10-05', '2026-10-11', 0)).toBe(1);
    expect(brutoDePago(unidadesDePago('semana', '2026-10-05', '2026-10-18', 3), 350000)).toBe(700000);
  });

  it('por mes: el valor del mes completo aunque haya trabajado pocos días', () => {
    expect(brutoDePago(unidadesDePago('mes', '2026-10-01', '2026-10-31', 2), 1300000)).toBe(1300000);
  });

  it('las horas que el empleado reporte no intervienen en el pago', () => {
    // La función solo recibe tipo, período, días trabajados y valor
    expect(unidadesDePago('mes', '2026-10-01', '2026-10-31', 0)).toBe(1);
  });
});
